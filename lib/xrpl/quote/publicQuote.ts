import { dropsToXrp, type Client } from 'xrpl'
import { isXrplAccountNotFoundError } from '@/lib/xrpl-errors'
import { isXrpCurrency, normalizeCurrency, type XrplAmountInput } from '@/lib/xrpl-amount'
import { resolveXrplNetwork, type XrplNetworkId } from '@/lib/xrpl-networks'
import { getTrustedIssuersForCurrency, type TrustedIssuerPolicySource } from '@/lib/xrpl-trusted-issuers'

const DEFAULT_SWAP_SLIPPAGE_BPS = 50
const MAX_SWAP_SLIPPAGE_BPS = 5_000
const ORDERBOOK_LIMIT = 50
const EXTRA_PRECISION = 18
const MAX_PUBLIC_INTERMEDIATES = 6

type JsonRecord = Record<string, unknown>

export type XrplSwapAssetInput = {
  currency: string
  issuer?: string
}

export type XrplPublicSwapQuote = {
  quoteMode: 'public'
  liquiditySource: 'amm' | 'orderbook' | 'multi_hop'
  routeKind: 'direct' | 'multi_hop'
  sourceAmount: XrplAmountInput
  quotedSourceAmount: XrplAmountInput
  destinationAmount: XrplAmountInput
  deliverMin: XrplAmountInput
  hops: Array<{
    from: XrplSwapAssetInput
    to: XrplSwapAssetInput
    liquiditySource: 'amm' | 'orderbook'
  }>
  pathCount: number
  alternativeCount: number
  fullReply: true
  slippageBps: number
  sourceSelection: 'native' | 'manual' | 'trusted_policy' | 'trusted_allowlist'
  destinationSelection: 'native' | 'manual' | 'trusted_policy' | 'trusted_allowlist'
}

type CandidateResolution = {
  candidates: XrplSwapAssetInput[]
  selection: XrplPublicSwapQuote['sourceSelection']
}

type SpecificPublicQuote = Omit<XrplPublicSwapQuote, 'sourceSelection' | 'destinationSelection'>

type BookOfferLike = {
  TakerGets?: unknown
  TakerPays?: unknown
  taker_gets_funded?: unknown
  taker_pays_funded?: unknown
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
    digits: BigInt(`${whole}${fraction}`),
  }
}

const POWERS_OF_TEN = [1n]

function pow10(exponent: number): bigint {
  while (POWERS_OF_TEN.length <= exponent) {
    POWERS_OF_TEN.push(POWERS_OF_TEN[POWERS_OF_TEN.length - 1]! * 10n)
  }
  return POWERS_OF_TEN[exponent]!
}

function formatDecimal(digits: bigint, scale: number): string {
  const digitsString = digits.toString().padStart(scale + 1, '0')
  if (scale === 0) {
    return digitsString
  }
  const whole = digitsString.slice(0, -scale) || '0'
  const fraction = digitsString.slice(-scale).replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : whole
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

function addDecimalStrings(left: string, right: string): string {
  const lhs = splitDecimal(left)
  const rhs = splitDecimal(right)
  const scale = Math.max(lhs.scale, rhs.scale)
  const lhsDigits = lhs.digits * pow10(scale - lhs.scale)
  const rhsDigits = rhs.digits * pow10(scale - rhs.scale)
  return formatDecimal(lhsDigits + rhsDigits, scale)
}

function subtractDecimalStrings(left: string, right: string): string {
  const lhs = splitDecimal(left)
  const rhs = splitDecimal(right)
  const scale = Math.max(lhs.scale, rhs.scale)
  const lhsDigits = lhs.digits * pow10(scale - lhs.scale)
  const rhsDigits = rhs.digits * pow10(scale - rhs.scale)
  if (lhsDigits < rhsDigits) {
    throw new Error('XRPL decimal subtraction underflow')
  }
  return formatDecimal(lhsDigits - rhsDigits, scale)
}

function multiplyByRatioFloor(
  value: string,
  numerator: number,
  denominator: number,
  precision = EXTRA_PRECISION,
): string {
  const parsed = splitDecimal(value)
  const scaled =
    (parsed.digits * BigInt(numerator) * pow10(precision)) /
    BigInt(denominator)
  return formatDecimal(scaled, parsed.scale + precision)
}

function multiplyDivideFloor(
  left: string,
  right: string,
  divisor: string,
  precision = EXTRA_PRECISION,
): string {
  const lhs = splitDecimal(left)
  const rhs = splitDecimal(right)
  const div = splitDecimal(divisor)
  if (div.digits === 0n) {
    throw new Error('XRPL decimal division by zero')
  }

  const scaled =
    (lhs.digits * rhs.digits * pow10(div.scale + precision)) /
    div.digits
  return formatDecimal(scaled, lhs.scale + rhs.scale + precision)
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
  return (lhs.issuer ?? '').toLowerCase() === (rhs.issuer ?? '').toLowerCase()
}

function normalizeSelectionSource(source: TrustedIssuerPolicySource): XrplPublicSwapQuote['sourceSelection'] {
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

function parseConfiguredIntermediateAssets(raw: string | undefined): XrplSwapAssetInput[] {
  const normalized = raw?.trim()
  if (!normalized) return []

  if (normalized.startsWith('[')) {
    try {
      const parsed = JSON.parse(normalized)
      if (!Array.isArray(parsed)) return []
      return parsed
        .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
        .map((entry) => ({
          currency: typeof entry.currency === 'string' ? entry.currency : '',
          issuer: typeof entry.issuer === 'string' ? entry.issuer : undefined,
        }))
        .flatMap((asset) => {
          try {
            return [assertResolvedAsset(asset)]
          } catch {
            return []
          }
        })
    } catch {
      return []
    }
  }

  return normalized
    .split(';')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => {
      const [currency, issuer] = segment.split(':', 2)
      return {
        currency: currency ?? '',
        issuer: issuer?.trim() || undefined,
      }
    })
    .flatMap((asset) => {
      try {
        return [assertResolvedAsset(asset)]
      } catch {
        return []
      }
    })
}

function getPublicIntermediateAssets(): XrplSwapAssetInput[] {
  return uniqueAssets([
    { currency: 'XRP' },
    ...parseConfiguredIntermediateAssets(process.env.XRPL_PUBLIC_QUOTE_INTERMEDIATES),
  ]).slice(0, MAX_PUBLIC_INTERMEDIATES)
}

function resolvePublicCandidates(input: {
  requested: XrplSwapAssetInput
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
      candidates: [assertResolvedAsset(requested)],
      selection: 'manual',
    }
  }

  const trusted = getTrustedIssuersForCurrency(requested.currency)
  const networkName = resolveXrplNetwork(input.networkId).name
  if (trusted.source === 'none' || trusted.issuers.length === 0) {
    throw new Error(`No trusted issuer policy configured for ${requested.currency} on ${networkName}.`)
  }

  return {
    candidates: uniqueAssets(
      trusted.issuers.map((issuer) => ({
        currency: requested.currency,
        issuer,
      })),
    ),
    selection: normalizeSelectionSource(trusted.source),
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

  if (record.value.trim() === '-1') return null

  return {
    currency: normalizeCurrency(record.currency),
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

function toLedgerCurrency(asset: XrplSwapAssetInput) {
  const normalized = assertResolvedAsset(asset)
  if (isXrpCurrency(normalized.currency)) {
    return { currency: 'XRP' as const }
  }
  return {
    currency: normalized.currency,
    issuer: normalized.issuer ?? '',
  }
}

function pickBetterQuote(current: SpecificPublicQuote | null, candidate: SpecificPublicQuote): SpecificPublicQuote {
  if (!current) return candidate

  const destinationCompare = compareDecimalStrings(candidate.destinationAmount.value, current.destinationAmount.value)
  if (destinationCompare > 0) return candidate
  if (destinationCompare < 0) return current

  if (candidate.routeKind === 'direct' && current.routeKind === 'multi_hop') {
    return candidate
  }
  if (candidate.routeKind === 'multi_hop' && current.routeKind === 'direct') {
    return current
  }

  if (candidate.liquiditySource === 'amm' && current.liquiditySource === 'orderbook') {
    return candidate
  }

  return current
}

function normalizeSwapSlippageBps(value?: number | null): number {
  if (value === undefined || value === null) {
    return DEFAULT_SWAP_SLIPPAGE_BPS
  }
  if (!Number.isInteger(value) || value < 0 || value > MAX_SWAP_SLIPPAGE_BPS) {
    throw new Error('Invalid swap slippage bps')
  }
  return value
}

async function quoteAmmPath(input: {
  client: Client
  sourceAmount: XrplAmountInput
  destinationAsset: XrplSwapAssetInput
  slippageBps: number
}): Promise<SpecificPublicQuote | null> {
  try {
    const response = await input.client.request({
      command: 'amm_info',
      asset: toLedgerCurrency(input.sourceAmount),
      asset2: toLedgerCurrency(input.destinationAsset),
      ledger_index: 'validated',
    })

    const amm = response.result.amm
    const reserveA = fromXrplAmount(amm.amount)
    const reserveB = fromXrplAmount(amm.amount2)
    if (!reserveA || !reserveB) {
      return null
    }

    const sourceReserve = matchesAsset(reserveA, input.sourceAmount)
      ? reserveA
      : matchesAsset(reserveB, input.sourceAmount)
        ? reserveB
        : null
    const destinationReserve = matchesAsset(reserveA, input.destinationAsset)
      ? reserveA
      : matchesAsset(reserveB, input.destinationAsset)
        ? reserveB
        : null

    if (!sourceReserve || !destinationReserve) {
      return null
    }
    if (
      compareDecimalStrings(sourceReserve.value, '0') <= 0 ||
      compareDecimalStrings(destinationReserve.value, '0') <= 0
    ) {
      return null
    }

    const effectiveInput = multiplyByRatioFloor(
      input.sourceAmount.value,
      100_000 - amm.trading_fee,
      100_000,
    )
    if (compareDecimalStrings(effectiveInput, '0') <= 0) {
      return null
    }

    const destinationValue = multiplyDivideFloor(
      destinationReserve.value,
      effectiveInput,
      addDecimalStrings(sourceReserve.value, effectiveInput),
    )
    if (compareDecimalStrings(destinationValue, '0') <= 0) {
      return null
    }

    return {
      quoteMode: 'public',
      liquiditySource: 'amm',
      routeKind: 'direct',
      sourceAmount: input.sourceAmount,
      quotedSourceAmount: input.sourceAmount,
      destinationAmount: {
        currency: destinationReserve.currency,
        issuer: destinationReserve.issuer,
        value: destinationValue,
      },
      deliverMin: {
        currency: destinationReserve.currency,
        issuer: destinationReserve.issuer,
        value: multiplyByRatioFloor(destinationValue, 10_000 - input.slippageBps, 10_000),
      },
      hops: [
        {
          from: {
            currency: input.sourceAmount.currency,
            issuer: input.sourceAmount.issuer,
          },
          to: {
            currency: destinationReserve.currency,
            issuer: destinationReserve.issuer,
          },
          liquiditySource: 'amm',
        },
      ],
      pathCount: 0,
      alternativeCount: 1,
      fullReply: true,
      slippageBps: input.slippageBps,
    }
  } catch (error) {
    if (isXrplAccountNotFoundError(error)) {
      return null
    }
    throw error
  }
}

async function quoteOrderbookPath(input: {
  client: Client
  sourceAmount: XrplAmountInput
  destinationAsset: XrplSwapAssetInput
  slippageBps: number
}): Promise<SpecificPublicQuote | null> {
  const response = await input.client.request({
    command: 'book_offers',
    taker_gets: toLedgerCurrency(input.destinationAsset),
    taker_pays: toLedgerCurrency(input.sourceAmount),
    ledger_index: 'validated',
    limit: ORDERBOOK_LIMIT,
  })

  const offers = ((response.result as { offers?: unknown[] }).offers ?? []) as BookOfferLike[]
  let remainingSource = input.sourceAmount.value
  let destinationTotal = '0'
  let consumedOffers = 0

  for (const offer of offers) {
    const destinationAvailable = fromXrplAmount(offer.taker_gets_funded ?? offer.TakerGets)
    const sourceRequired = fromXrplAmount(offer.taker_pays_funded ?? offer.TakerPays)
    if (!destinationAvailable || !sourceRequired) continue
    if (!matchesAsset(destinationAvailable, input.destinationAsset) || !matchesAsset(sourceRequired, input.sourceAmount)) {
      continue
    }
    if (
      compareDecimalStrings(destinationAvailable.value, '0') <= 0 ||
      compareDecimalStrings(sourceRequired.value, '0') <= 0
    ) {
      continue
    }

    consumedOffers += 1
    if (compareDecimalStrings(remainingSource, sourceRequired.value) >= 0) {
      destinationTotal = addDecimalStrings(destinationTotal, destinationAvailable.value)
      remainingSource = subtractDecimalStrings(remainingSource, sourceRequired.value)
      if (compareDecimalStrings(remainingSource, '0') === 0) {
        break
      }
      continue
    }

    destinationTotal = addDecimalStrings(
      destinationTotal,
      multiplyDivideFloor(
        remainingSource,
        destinationAvailable.value,
        sourceRequired.value,
      ),
    )
    remainingSource = '0'
    break
  }

  if (compareDecimalStrings(remainingSource, '0') > 0 || compareDecimalStrings(destinationTotal, '0') <= 0) {
    return null
  }

  return {
    quoteMode: 'public',
    liquiditySource: 'orderbook',
    routeKind: 'direct',
    sourceAmount: input.sourceAmount,
    quotedSourceAmount: input.sourceAmount,
    destinationAmount: {
      currency: input.destinationAsset.currency,
      issuer: input.destinationAsset.issuer,
      value: destinationTotal,
    },
    deliverMin: {
      currency: input.destinationAsset.currency,
      issuer: input.destinationAsset.issuer,
      value: multiplyByRatioFloor(destinationTotal, 10_000 - input.slippageBps, 10_000),
    },
    hops: [
      {
        from: {
          currency: input.sourceAmount.currency,
          issuer: input.sourceAmount.issuer,
        },
        to: {
          currency: input.destinationAsset.currency,
          issuer: input.destinationAsset.issuer,
        },
        liquiditySource: 'orderbook',
      },
    ],
    pathCount: 0,
    alternativeCount: consumedOffers,
    fullReply: true,
    slippageBps: input.slippageBps,
  }
}

async function quoteBestDirectPublicPath(input: {
  client: Client
  sourceAmount: XrplAmountInput
  destinationAsset: XrplSwapAssetInput
  slippageBps: number
}): Promise<SpecificPublicQuote | null> {
  const [ammQuote, orderbookQuote] = await Promise.all([
    quoteAmmPath(input),
    quoteOrderbookPath(input),
  ])

  let bestQuote: SpecificPublicQuote | null = null
  if (ammQuote) {
    bestQuote = pickBetterQuote(bestQuote, ammQuote)
  }
  if (orderbookQuote) {
    bestQuote = pickBetterQuote(bestQuote, orderbookQuote)
  }
  return bestQuote
}

function combineMultiHopQuote(input: {
  sourceAmount: XrplAmountInput
  firstLeg: SpecificPublicQuote
  secondLeg: SpecificPublicQuote
  slippageBps: number
}): SpecificPublicQuote {
  return {
    quoteMode: 'public',
    liquiditySource: 'multi_hop',
    routeKind: 'multi_hop',
    sourceAmount: input.sourceAmount,
    quotedSourceAmount: input.sourceAmount,
    destinationAmount: input.secondLeg.destinationAmount,
    deliverMin: {
      currency: input.secondLeg.destinationAmount.currency,
      issuer: input.secondLeg.destinationAmount.issuer,
      value: multiplyByRatioFloor(
        input.secondLeg.destinationAmount.value,
        10_000 - input.slippageBps,
        10_000,
      ),
    },
    hops: [...input.firstLeg.hops, ...input.secondLeg.hops],
    pathCount: 1,
    alternativeCount: input.firstLeg.alternativeCount + input.secondLeg.alternativeCount,
    fullReply: true,
    slippageBps: input.slippageBps,
  }
}

export async function getPublicXrplSwapQuote(input: {
  client: Client
  networkId: XrplNetworkId
  sourceAmount: XrplAmountInput
  destinationAsset: XrplSwapAssetInput
  slippageBps?: number | null
}): Promise<XrplPublicSwapQuote> {
  const sourceAmount = normalizeAmount(input.sourceAmount)
  const destinationAsset = normalizeAsset(input.destinationAsset)
  const slippageBps = normalizeSwapSlippageBps(input.slippageBps)

  if (sameAsset(sourceAmount, destinationAsset)) {
    throw new Error('Source and destination assets must differ')
  }

  const resolvedSource = resolvePublicCandidates({
    requested: sourceAmount,
    networkId: input.networkId,
  })
  const resolvedDestination = resolvePublicCandidates({
    requested: destinationAsset,
    networkId: input.networkId,
  })

  let bestQuote: SpecificPublicQuote | null = null
  const intermediates = getPublicIntermediateAssets()

  for (const sourceCandidate of resolvedSource.candidates) {
    for (const destinationCandidate of resolvedDestination.candidates) {
      if (sameAsset(sourceCandidate, destinationCandidate)) continue

      const normalizedSourceAmount = {
        currency: sourceCandidate.currency,
        issuer: sourceCandidate.issuer,
        value: sourceAmount.value,
      }

      const directQuote = await quoteBestDirectPublicPath({
        client: input.client,
        sourceAmount: normalizedSourceAmount,
        destinationAsset: destinationCandidate,
        slippageBps,
      })
      if (directQuote) {
        bestQuote = pickBetterQuote(bestQuote, directQuote)
      }

      const multiHopQuotes = await Promise.all(
        intermediates.map(async (intermediateAsset) => {
          if (
            sameAsset(sourceCandidate, intermediateAsset) ||
            sameAsset(destinationCandidate, intermediateAsset)
          ) {
            return null
          }

          const firstLeg = await quoteBestDirectPublicPath({
            client: input.client,
            sourceAmount: normalizedSourceAmount,
            destinationAsset: intermediateAsset,
            slippageBps,
          })
          if (!firstLeg) return null

          const secondLeg = await quoteBestDirectPublicPath({
            client: input.client,
            sourceAmount: firstLeg.destinationAmount,
            destinationAsset: destinationCandidate,
            slippageBps,
          })
          if (!secondLeg) return null

          return combineMultiHopQuote({
            sourceAmount: normalizedSourceAmount,
            firstLeg,
            secondLeg,
            slippageBps,
          })
        }),
      )

      for (const multiHopQuote of multiHopQuotes) {
        if (!multiHopQuote) continue
        bestQuote = pickBetterQuote(bestQuote, multiHopQuote)
      }
    }
  }

  if (!bestQuote) {
    throw new Error('No XRPL swap path found')
  }

  return {
    ...bestQuote,
    sourceSelection: resolvedSource.selection,
    destinationSelection: resolvedDestination.selection,
  }
}
