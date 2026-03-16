import { randomUUID } from 'node:crypto'
import {
  Client,
  PaymentFlags,
  dropsToXrp,
  type Amount,
  type Path,
} from 'xrpl'
import { isXrpCurrency, normalizeCurrency, toXrplAmount, type XrplAmountInput } from '@/lib/xrpl-amount'
import { resolveXrplNetwork, type XrplNetworkId } from '@/lib/xrpl-networks'
import { getTrustedIssuersForCurrency, type TrustedIssuerPolicySource } from '@/lib/xrpl-trusted-issuers'

const DEFAULT_SWAP_SLIPPAGE_BPS = 50
const MAX_SWAP_SLIPPAGE_BPS = 5_000
const PATH_FIND_FULL_REPLY_TIMEOUT_MS = 1_200

type JsonRecord = Record<string, unknown>

export type XrplSwapAssetInput = {
  currency: string
  issuer?: string
}

export type XrplSwapQuote = {
  sourceAmount: XrplAmountInput
  quotedSourceAmount: XrplAmountInput
  destinationAmount: XrplAmountInput
  deliverMin: XrplAmountInput
  paths: Path[]
  pathCount: number
  alternativeCount: number
  fullReply: boolean
  slippageBps: number
  sourceSelection: 'native' | 'manual' | 'trusted_policy' | 'trusted_allowlist'
  destinationSelection: 'native' | 'manual' | 'trusted_policy' | 'trusted_allowlist'
}

type PathFindLikeResult = {
  alternatives: unknown[]
  fullReply: boolean
}

type ParsedAlternative = {
  sourceAmount: XrplAmountInput
  destinationAmount: XrplAmountInput
  paths: Path[]
}

type AccountTrustLine = {
  currency: string
  issuer: string
  balance: string
  limit: string | null
}

type CandidateResolution = {
  candidates: XrplSwapAssetInput[]
  selection: XrplSwapQuote['sourceSelection']
}

type SpecificSwapQuote = Omit<XrplSwapQuote, 'sourceSelection' | 'destinationSelection'>

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as JsonRecord
}

function normalizePositiveDecimal(value: string): string {
  const trimmed = value.trim()
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error('Invalid XRPL swap amount')
  }

  const [wholeRaw, fractionRaw = ''] = trimmed.split('.')
  const whole = wholeRaw.replace(/^0+(?=\d)/, '') || '0'
  const fraction = fractionRaw.replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : whole
}

function splitDecimal(value: string) {
  const normalized = normalizePositiveDecimal(value)
  const [whole, fraction = ''] = normalized.split('.')
  return {
    normalized,
    whole,
    fraction,
    scale: fraction.length,
  }
}

function compareDecimalStrings(left: string, right: string): number {
  const lhs = splitDecimal(left)
  const rhs = splitDecimal(right)

  if (lhs.whole.length !== rhs.whole.length) {
    return lhs.whole.length > rhs.whole.length ? 1 : -1
  }
  if (lhs.whole !== rhs.whole) {
    return lhs.whole > rhs.whole ? 1 : -1
  }

  const scale = Math.max(lhs.scale, rhs.scale)
  const lhsFraction = lhs.fraction.padEnd(scale, '0')
  const rhsFraction = rhs.fraction.padEnd(scale, '0')
  if (lhsFraction === rhsFraction) return 0
  return lhsFraction > rhsFraction ? 1 : -1
}

function multiplyDecimalFloor(value: string, numerator: number, denominator: number): string {
  const parsed = splitDecimal(value)
  const digits = BigInt(`${parsed.whole}${parsed.fraction}`)
  const scaled = (digits * BigInt(numerator)) / BigInt(denominator)
  const digitsString = scaled.toString().padStart(parsed.scale + 1, '0')

  if (parsed.scale === 0) {
    return digitsString
  }

  const whole = digitsString.slice(0, -parsed.scale) || '0'
  const fraction = digitsString.slice(-parsed.scale).replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : whole
}

function normalizeAsset(input: XrplSwapAssetInput): XrplSwapAssetInput {
  const currency = normalizeCurrency(input.currency)
  const issuer = input.issuer?.trim()
  if (!currency) {
    throw new Error('Currency is required')
  }
  return {
    currency,
    issuer: isXrpCurrency(currency) ? undefined : issuer,
  }
}

function normalizeAmount(input: XrplAmountInput): XrplAmountInput {
  const asset = normalizeAsset(input)
  return {
    currency: asset.currency,
    issuer: asset.issuer,
    value: normalizePositiveDecimal(input.value),
  }
}

function assertResolvedAsset(input: XrplSwapAssetInput): XrplSwapAssetInput {
  const normalized = normalizeAsset(input)
  if (!isXrpCurrency(normalized.currency) && !normalized.issuer) {
    throw new Error(`Issuer required for non-XRP ${normalized.currency}`)
  }
  return normalized
}

function sameAsset(left: XrplSwapAssetInput, right: XrplSwapAssetInput): boolean {
  const lhs = normalizeAsset(left)
  const rhs = normalizeAsset(right)
  if (lhs.currency !== rhs.currency) {
    return false
  }
  if (isXrpCurrency(lhs.currency)) {
    return true
  }
  if (!lhs.issuer || !rhs.issuer) {
    return true
  }
  return (
    lhs.currency === rhs.currency &&
    (lhs.issuer ?? '').toLowerCase() === (rhs.issuer ?? '').toLowerCase()
  )
}

function buildPathFindSendMax(amount: XrplAmountInput): Amount {
  return toXrplAmount(amount)
}

function buildPathFindDestinationAmount(asset: XrplSwapAssetInput): Amount {
  const normalized = assertResolvedAsset(asset)
  if (isXrpCurrency(normalized.currency)) {
    return '-1'
  }
  return {
    currency: normalized.currency,
    issuer: normalized.issuer ?? '',
    value: '-1',
  }
}

function fromXrplAmount(input: unknown): XrplAmountInput | null {
  if (typeof input === 'string' && /^\d+$/.test(input.trim())) {
    return {
      currency: 'XRP',
      value: normalizePositiveDecimal(String(dropsToXrp(input.trim()))),
    }
  }

  const record = asRecord(input)
  if (!record) return null
  if (typeof record.currency !== 'string' || typeof record.value !== 'string') {
    return null
  }

  const currency = normalizeCurrency(record.currency)
  if (record.value.trim() === '-1') return null

  return {
    currency,
    issuer: typeof record.issuer === 'string' ? record.issuer.trim() : undefined,
    value: normalizePositiveDecimal(record.value),
  }
}

function matchesAsset(amount: XrplAmountInput, asset: XrplSwapAssetInput): boolean {
  const normalizedAsset = assertResolvedAsset(asset)
  if (normalizeCurrency(amount.currency) !== normalizedAsset.currency) {
    return false
  }
  if (isXrpCurrency(normalizedAsset.currency)) {
    return true
  }
  return (amount.issuer ?? '').toLowerCase() === (normalizedAsset.issuer ?? '').toLowerCase()
}

function extractPathFindResult(input: unknown): PathFindLikeResult | null {
  const root = asRecord(input)
  if (!root) return null
  const payload = asRecord(root.result) ?? root
  if (!payload) return null
  const alternatives = Array.isArray(payload.alternatives) ? payload.alternatives : null
  if (!alternatives) return null
  return {
    alternatives,
    fullReply: payload.full_reply === true,
  }
}

function parseAlternative(
  input: unknown,
  sourceAsset: XrplSwapAssetInput,
  destinationAsset: XrplSwapAssetInput,
): ParsedAlternative | null {
  const record = asRecord(input)
  if (!record) return null

  const sourceAmount = fromXrplAmount(record.source_amount)
  const destinationAmount = fromXrplAmount(record.destination_amount)
  if (!sourceAmount || !destinationAmount) {
    return null
  }
  if (!matchesAsset(sourceAmount, sourceAsset) || !matchesAsset(destinationAmount, destinationAsset)) {
    return null
  }

  return {
    sourceAmount,
    destinationAmount,
    paths: Array.isArray(record.paths_computed) ? (record.paths_computed as Path[]) : [],
  }
}

function pickBestAlternative(input: {
  alternatives: unknown[]
  sourceAsset: XrplSwapAssetInput
  destinationAsset: XrplSwapAssetInput
}): ParsedAlternative | null {
  let best: ParsedAlternative | null = null

  for (const alternative of input.alternatives) {
    const parsed = parseAlternative(alternative, input.sourceAsset, input.destinationAsset)
    if (!parsed) continue

    if (!best) {
      best = parsed
      continue
    }

    const destinationCompare = compareDecimalStrings(parsed.destinationAmount.value, best.destinationAmount.value)
    if (destinationCompare > 0) {
      best = parsed
      continue
    }

    if (destinationCompare === 0 && compareDecimalStrings(parsed.sourceAmount.value, best.sourceAmount.value) < 0) {
      best = parsed
    }
  }

  return best
}

function createPaymentFlags(): number {
  return PaymentFlags.tfPartialPayment | PaymentFlags.tfLimitQuality
}

function normalizeSelectionSource(source: TrustedIssuerPolicySource): XrplSwapQuote['sourceSelection'] {
  return source === 'policy' ? 'trusted_policy' : source === 'allowlist' ? 'trusted_allowlist' : 'manual'
}

function uniqueAssets(candidates: XrplSwapAssetInput[]): XrplSwapAssetInput[] {
  const seen = new Set<string>()
  const unique: XrplSwapAssetInput[] = []

  for (const candidate of candidates) {
    const normalized = normalizeAsset(candidate)
    const key = isXrpCurrency(normalized.currency)
      ? normalized.currency
      : `${normalized.currency}:${normalized.issuer?.toLowerCase() ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(normalized)
  }

  return unique
}

function hasPositiveBalance(value: string): boolean {
  return compareDecimalStrings(normalizePositiveDecimal(value), '0') > 0
}

async function loadAccountTrustLines(client: Client, account: string): Promise<AccountTrustLine[]> {
  const response = await client.request({
    command: 'account_lines',
    account,
    ledger_index: 'validated',
    limit: 400,
  })

  const rawLines = ((response.result as { lines?: unknown[] }).lines ?? []) as Array<{
    account?: string
    currency?: string
    balance?: string
    limit?: string
  }>

  return rawLines
    .map((line) => ({
      currency: normalizeCurrency(line.currency ?? ''),
      issuer: line.account?.trim() ?? '',
      balance: typeof line.balance === 'string' ? line.balance : '0',
      limit: typeof line.limit === 'string' ? line.limit : null,
    }))
    .filter((line) => line.currency !== 'UNKNOWN' && line.issuer)
}

function resolveSourceCandidates(input: {
  requested: XrplAmountInput
  accountLines: AccountTrustLine[]
  networkId: XrplNetworkId
}): CandidateResolution {
  const requested = normalizeAmount(input.requested)
  if (isXrpCurrency(requested.currency)) {
    return {
      candidates: [{ currency: 'XRP' }],
      selection: 'native',
    }
  }
  if (requested.issuer?.trim()) {
    return {
      candidates: [assertResolvedAsset({ currency: requested.currency, issuer: requested.issuer })],
      selection: 'manual',
    }
  }

  const trusted = getTrustedIssuersForCurrency(requested.currency)
  const networkName = resolveXrplNetwork(input.networkId).name
  if (trusted.source === 'none' || trusted.issuers.length === 0) {
    throw new Error(`No trusted issuer policy configured for ${requested.currency} on ${networkName}.`)
  }

  const candidates = uniqueAssets(
    input.accountLines
      .filter(
        (line) =>
          line.currency === requested.currency &&
          trusted.issuers.includes(line.issuer) &&
          hasPositiveBalance(line.balance),
      )
      .map((line) => ({ currency: requested.currency, issuer: line.issuer })),
  )

  if (candidates.length === 0) {
    throw new Error(`No trusted ${requested.currency} balance is available in this wallet on ${networkName}.`)
  }

  return {
    candidates,
    selection: normalizeSelectionSource(trusted.source),
  }
}

function resolveDestinationCandidates(input: {
  requested: XrplSwapAssetInput
  accountLines: AccountTrustLine[]
  networkId: XrplNetworkId
}): CandidateResolution {
  const requested = normalizeAsset(input.requested)
  if (isXrpCurrency(requested.currency)) {
    return {
      candidates: [{ currency: 'XRP' }],
      selection: 'native',
    }
  }
  if (requested.issuer?.trim()) {
    return {
      candidates: [assertResolvedAsset({ currency: requested.currency, issuer: requested.issuer })],
      selection: 'manual',
    }
  }

  const trusted = getTrustedIssuersForCurrency(requested.currency)
  const networkName = resolveXrplNetwork(input.networkId).name
  if (trusted.source === 'none' || trusted.issuers.length === 0) {
    throw new Error(`No trusted issuer policy configured for ${requested.currency} on ${networkName}.`)
  }

  const candidates = uniqueAssets(
    input.accountLines
      .filter(
        (line) =>
          line.currency === requested.currency &&
          trusted.issuers.includes(line.issuer),
      )
      .map((line) => ({ currency: requested.currency, issuer: line.issuer })),
  )

  if (candidates.length === 0) {
    throw new Error(`No trusted ${requested.currency} trustline is configured in this wallet on ${networkName}.`)
  }

  return {
    candidates,
    selection: normalizeSelectionSource(trusted.source),
  }
}

function pickBetterQuote(current: SpecificSwapQuote | null, candidate: SpecificSwapQuote): SpecificSwapQuote {
  if (!current) return candidate

  const destinationCompare = compareDecimalStrings(candidate.destinationAmount.value, current.destinationAmount.value)
  if (destinationCompare > 0) return candidate
  if (destinationCompare < 0) return current

  if (compareDecimalStrings(candidate.quotedSourceAmount.value, current.quotedSourceAmount.value) < 0) {
    return candidate
  }

  return current
}

async function withDedicatedPathFindClient<T>(
  networkId: XrplNetworkId,
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client(resolveXrplNetwork(networkId).wsUrl)
  await client.connect()
  try {
    return await fn(client)
  } finally {
    if (client.isConnected()) {
      await client.disconnect().catch(() => {})
    }
  }
}

function waitForFullReply(client: Client, id: string): {
  promise: Promise<unknown | null>
  cancel: () => void
} {
  let timeout: ReturnType<typeof setTimeout> | null = null
  let settled = false

  function cleanup() {
    if (timeout) {
      clearTimeout(timeout)
      timeout = null
    }
    client.removeListener('path_find', handleUpdate)
  }

  function cancel() {
    if (settled) return
    settled = true
    cleanup()
  }

  function handleUpdate(update: unknown) {
    const payload = asRecord(update)
    if (!payload || payload.id !== id || payload.full_reply !== true || settled) {
      return
    }
    settled = true
    cleanup()
    resolver(update)
  }

  let resolver: (value: unknown | null) => void = () => {}
  const promise = new Promise<unknown | null>((resolve) => {
    resolver = resolve
    timeout = setTimeout(() => {
      if (settled) return
      settled = true
      cleanup()
      resolve(null)
    }, PATH_FIND_FULL_REPLY_TIMEOUT_MS)
  })

  client.on('path_find', handleUpdate)

  return {
    promise,
    cancel,
  }
}

export function normalizeSwapSlippageBps(value?: number | null): number {
  if (value === undefined || value === null) {
    return DEFAULT_SWAP_SLIPPAGE_BPS
  }
  if (!Number.isInteger(value) || value < 0 || value > MAX_SWAP_SLIPPAGE_BPS) {
    throw new Error('Invalid swap slippage bps')
  }
  return value
}

export function buildSwapPaymentTx(input: {
  account: string
  quote: XrplSwapQuote
}) {
  return {
    TransactionType: 'Payment' as const,
    Account: input.account,
    Destination: input.account,
    Amount: toXrplAmount(input.quote.destinationAmount),
    SendMax: buildPathFindSendMax(input.quote.sourceAmount),
    DeliverMin: toXrplAmount(input.quote.deliverMin),
    Flags: createPaymentFlags(),
    ...(input.quote.paths.length > 0 ? { Paths: input.quote.paths } : {}),
  }
}

async function quoteSpecificSwapPath(input: {
  client: Client
  account: string
  sourceAmount: XrplAmountInput
  destinationAsset: XrplSwapAssetInput
  slippageBps: number
}): Promise<SpecificSwapQuote | null> {
  const resolvedSource = normalizeAmount(input.sourceAmount)
  const resolvedDestination = assertResolvedAsset(input.destinationAsset)
  const requestId = `xrpl-swap-${randomUUID()}`
  const fullReply = waitForFullReply(input.client, requestId)

  try {
    const initialResponse = await input.client.request({
      id: requestId,
      command: 'path_find',
      subcommand: 'create',
      source_account: input.account,
      destination_account: input.account,
      send_max: buildPathFindSendMax(resolvedSource),
      destination_amount: buildPathFindDestinationAmount(resolvedDestination),
    })

    const initialResult = extractPathFindResult(initialResponse)
    if (initialResult?.fullReply) {
      fullReply.cancel()
    }
    const fullReplyUpdate = initialResult?.fullReply ? null : await fullReply.promise
    const finalResult = extractPathFindResult(fullReplyUpdate) ?? initialResult

    if (!finalResult) {
      throw new Error('XRPL pathfinding returned an invalid response')
    }

    const bestAlternative = pickBestAlternative({
      alternatives: finalResult.alternatives,
      sourceAsset: resolvedSource,
      destinationAsset: resolvedDestination,
    })

    if (!bestAlternative) {
      return null
    }

    return {
      sourceAmount: resolvedSource,
      quotedSourceAmount: bestAlternative.sourceAmount,
      destinationAmount: bestAlternative.destinationAmount,
      deliverMin: {
        ...bestAlternative.destinationAmount,
        value: multiplyDecimalFloor(
          bestAlternative.destinationAmount.value,
          10_000 - input.slippageBps,
          10_000,
        ),
      },
      paths: bestAlternative.paths,
      pathCount: bestAlternative.paths.length,
      alternativeCount: finalResult.alternatives.length,
      fullReply: finalResult.fullReply,
      slippageBps: input.slippageBps,
    }
  } finally {
    fullReply.cancel()
    await input.client.request({
      id: requestId,
      command: 'path_find',
      subcommand: 'close',
    }).catch(() => {})
  }
}

export async function quoteXrplSwap(input: {
  networkId: XrplNetworkId
  account: string
  sourceAmount: XrplAmountInput
  destinationAsset: XrplSwapAssetInput
  slippageBps?: number | null
}): Promise<XrplSwapQuote> {
  const sourceAmount = normalizeAmount(input.sourceAmount)
  const destinationAsset = normalizeAsset(input.destinationAsset)
  const slippageBps = normalizeSwapSlippageBps(input.slippageBps)

  if (sameAsset(sourceAmount, destinationAsset)) {
    throw new Error('Source and destination assets must differ')
  }

  return withDedicatedPathFindClient(input.networkId, async (client) => {
    const accountLines =
      (!sourceAmount.issuer && !isXrpCurrency(sourceAmount.currency)) ||
      (!destinationAsset.issuer && !isXrpCurrency(destinationAsset.currency))
        ? await loadAccountTrustLines(client, input.account)
        : []

    const resolvedSource = resolveSourceCandidates({
      requested: sourceAmount,
      accountLines,
      networkId: input.networkId,
    })
    const resolvedDestination = resolveDestinationCandidates({
      requested: destinationAsset,
      accountLines,
      networkId: input.networkId,
    })

    let bestQuote: SpecificSwapQuote | null = null
    for (const sourceCandidate of resolvedSource.candidates) {
      for (const destinationCandidate of resolvedDestination.candidates) {
        if (sameAsset(sourceCandidate, destinationCandidate)) continue

        const candidateQuote = await quoteSpecificSwapPath({
          client,
          account: input.account,
          sourceAmount: {
            currency: sourceCandidate.currency,
            issuer: sourceCandidate.issuer,
            value: sourceAmount.value,
          },
          destinationAsset: destinationCandidate,
          slippageBps,
        })

        if (!candidateQuote) continue
        bestQuote = pickBetterQuote(bestQuote, candidateQuote)
      }
    }

    if (!bestQuote) {
      throw new Error(
        `No trusted swap path found for ${sourceAmount.currency} -> ${destinationAsset.currency}.`,
      )
    }

    return {
      ...bestQuote,
      sourceSelection: resolvedSource.selection,
      destinationSelection: resolvedDestination.selection,
    }
  })
}
