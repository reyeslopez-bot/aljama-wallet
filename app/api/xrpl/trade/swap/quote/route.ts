import { z } from 'zod'
import { buildRateLimitKey, rateLimit } from '@/lib/security/rate-limit'
import { errorJson, okJson } from '@/lib/security/api-response'
import { withApiRoute } from '@/lib/security/api-route'
import { logError } from '@/lib/security/logging'
import { getErrorMessage } from '@/lib/security/errors'
import { DEFAULT_XRPL_NETWORK_ID, isXrplNetworkId } from '@/lib/xrpl-networks'
import { getXrplSignerAccount } from '@/lib/xrpl-signer'
import { quoteXrplSwap } from '@/services/xrpl-swap.service'

const MAX_SLIPPAGE_BPS = 5_000

const querySchema = z.object({
  network: z.string().optional(),
  sourceCurrency: z.string().min(3).max(40),
  sourceIssuer: z.string().min(25).max(80).optional(),
  sourceValue: z.string().regex(/^\d+(\.\d+)?$/),
  destinationCurrency: z.string().min(3).max(40),
  destinationIssuer: z.string().min(25).max(80).optional(),
  slippageBps: z.coerce.number().int().min(0).max(MAX_SLIPPAGE_BPS).optional(),
})

function resolveRouteStatus(message: string): number {
  if (
    message === 'Invalid swap slippage bps' ||
    message === 'Source and destination assets must differ' ||
    message === 'No XRPL swap path found' ||
    message === 'Invalid XRPL swap amount' ||
    message === 'Currency is required' ||
    message.startsWith('Issuer required for non-XRP')
  ) {
    return 400
  }
  if (/Missing XRPL signer seed/i.test(message)) {
    return 503
  }
  return 500
}

async function getXrplTradeSwapQuote(req: Request) {
  try {
    const rateKey = buildRateLimitKey(req)
    const limitState = await rateLimit({
      bucket: 'xrpl-swap-quote',
      key: rateKey,
      limit: 60,
      windowMs: 60_000,
      ...(process.env.NODE_ENV === 'production' ? { requireDistributed: true as const } : {}),
    })
    if (!limitState.ok) {
      if (limitState.failureKind === 'backend_unavailable') {
        return errorJson(
          503,
          'rate_limit_backend_unavailable',
          'RATE_LIMIT_BACKEND_UNAVAILABLE',
          { retryAfter: limitState.retryAfter },
          { headers: { 'retry-after': String(limitState.retryAfter) } },
        )
      }
      return errorJson(
        429,
        'rate_limited',
        'RATE_LIMITED',
        { retryAfter: limitState.retryAfter },
        { headers: { 'retry-after': String(limitState.retryAfter) } },
      )
    }

    const { searchParams } = new URL(req.url)
    const parsed = querySchema.safeParse({
      network: searchParams.get('network') ?? undefined,
      sourceCurrency: searchParams.get('sourceCurrency') ?? '',
      sourceIssuer: searchParams.get('sourceIssuer') ?? undefined,
      sourceValue: searchParams.get('sourceValue') ?? '',
      destinationCurrency: searchParams.get('destinationCurrency') ?? '',
      destinationIssuer: searchParams.get('destinationIssuer') ?? undefined,
      slippageBps: searchParams.get('slippageBps') ?? undefined,
    })
    if (!parsed.success) {
      return errorJson(400, 'invalid_query', 'Invalid XRPL swap quote query', parsed.error.format())
    }

    const requestedNetwork = parsed.data.network?.trim()
    if (requestedNetwork && !isXrplNetworkId(requestedNetwork)) {
      return errorJson(400, 'invalid_network', 'Invalid XRPL network')
    }
    const networkId =
      requestedNetwork && isXrplNetworkId(requestedNetwork)
        ? requestedNetwork
        : DEFAULT_XRPL_NETWORK_ID

    const account = getXrplSignerAccount()
    const quote = await quoteXrplSwap({
      networkId,
      account: account.address,
      sourceAmount: {
        currency: parsed.data.sourceCurrency,
        issuer: parsed.data.sourceIssuer,
        value: parsed.data.sourceValue,
      },
      destinationAsset: {
        currency: parsed.data.destinationCurrency,
        issuer: parsed.data.destinationIssuer,
      },
      slippageBps: parsed.data.slippageBps,
    })

    return okJson({
      network: networkId,
      account: account.address,
      quote: {
        sourceAmount: quote.sourceAmount,
        quotedSourceAmount: quote.quotedSourceAmount,
        destinationAmount: quote.destinationAmount,
        deliverMin: quote.deliverMin,
        pathCount: quote.pathCount,
        alternativeCount: quote.alternativeCount,
        fullReply: quote.fullReply,
        slippageBps: quote.slippageBps,
      },
    })
  } catch (error) {
    const message = getErrorMessage(error, 'Failed to quote XRPL swap')
    const status = resolveRouteStatus(message)
    if (status >= 500) {
      logError('xrpl-trade-swap-quote', error)
    }
    return errorJson(status, 'xrpl_swap_quote_failed', message)
  }
}

export const GET = withApiRoute(
  { scope: 'api:xrpl-trade-swap-quote', timeoutMs: 10_000 },
  getXrplTradeSwapQuote,
)
