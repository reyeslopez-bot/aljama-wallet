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
  if (!isXrpCurrency(currency) && !issuer) {
    throw new Error(`Issuer required for non-XRP ${currency}`)
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

function sameAsset(left: XrplSwapAssetInput, right: XrplSwapAssetInput): boolean {
  const lhs = normalizeAsset(left)
  const rhs = normalizeAsset(right)
  return (
    lhs.currency === rhs.currency &&
    (isXrpCurrency(lhs.currency) || (lhs.issuer ?? '').toLowerCase() === (rhs.issuer ?? '').toLowerCase())
  )
}

function buildPathFindSendMax(amount: XrplAmountInput): Amount {
  return toXrplAmount(amount)
}

function buildPathFindDestinationAmount(asset: XrplSwapAssetInput): Amount {
  const normalized = normalizeAsset(asset)
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
  const normalizedAsset = normalizeAsset(asset)
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
    const requestId = `xrpl-swap-${randomUUID()}`
    const fullReply = waitForFullReply(client, requestId)

    let initialResponse: unknown
    try {
      initialResponse = await client.request({
        id: requestId,
        command: 'path_find',
        subcommand: 'create',
        source_account: input.account,
        destination_account: input.account,
        send_max: buildPathFindSendMax(sourceAmount),
        destination_amount: buildPathFindDestinationAmount(destinationAsset),
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
        sourceAsset: sourceAmount,
        destinationAsset,
      })

      if (!bestAlternative) {
        throw new Error('No XRPL swap path found')
      }

      return {
        sourceAmount,
        quotedSourceAmount: bestAlternative.sourceAmount,
        destinationAmount: bestAlternative.destinationAmount,
        deliverMin: {
          ...bestAlternative.destinationAmount,
          value: multiplyDecimalFloor(
            bestAlternative.destinationAmount.value,
            10_000 - slippageBps,
            10_000,
          ),
        },
        paths: bestAlternative.paths,
        pathCount: bestAlternative.paths.length,
        alternativeCount: finalResult.alternatives.length,
        fullReply: finalResult.fullReply,
        slippageBps,
      }
    } finally {
      fullReply.cancel()
      await client.request({
        id: requestId,
        command: 'path_find',
        subcommand: 'close',
      }).catch(() => {})
    }
  })
}
