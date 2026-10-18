import { isValidClassicAddress } from 'xrpl'
import { z } from 'zod'
import { requireSession } from '@/lib/security/session'
import { isAllowedOrigin } from '@/lib/security/origin'
import { buildRateLimitKey, rateLimit } from '@/lib/security/rate-limit'
import { errorJson, okJson } from '@/lib/security/api-response'
import { withApiRoute } from '@/lib/security/api-route'
import { readJsonBody } from '@/lib/security/request-body'
import { getErrorMessage } from '@/lib/security/errors'
import { logError } from '@/lib/security/logging'
import { DEFAULT_XRPL_NETWORK_ID, isXrplNetworkId } from '@/lib/xrpl-networks'
import { doesXrplAccountExist } from '@/lib/xrpl/quote/accountExists'
import { getXrplClient } from '@/infra/xrpl/client'
import { assessXrplActionRisk } from '@/services/xrpl-risk.service'
import { buildSwapPaymentTx, quoteXrplSwap } from '@/services/xrpl-swap.service'

const MAX_SLIPPAGE_BPS = 5_000

const assetSchema = z.object({
  currency: z.string().min(3).max(40),
  issuer: z.string().min(25).max(80).optional(),
})

const amountSchema = assetSchema.extend({
  value: z.string().regex(/^\d+(\.\d+)?$/),
})

const schema = z.object({
  network: z.string().optional(),
  account: z.string().min(25).max(80),
  idempotencyKey: z.string().uuid(),
  sourceAmount: amountSchema,
  destinationAsset: assetSchema,
  slippageBps: z.number().int().min(0).max(MAX_SLIPPAGE_BPS).optional(),
})

function resolveRouteStatus(message: string): number {
  if (
    message === 'Invalid swap slippage bps' ||
    message === 'Source and destination assets must differ' ||
    message === 'No XRPL swap path found' ||
    message === 'Invalid XRPL swap amount' ||
    message === 'Currency is required' ||
    message.startsWith('Issuer required for non-XRP') ||
    message.startsWith('No trusted ')
  ) {
    return 400
  }
  return 500
}

async function postXrplTradeSwapPrepare(req: Request) {
  try {
    const session = await requireSession()
    if (!session) {
      return errorJson(401, 'unauthorized', 'UNAUTHORIZED')
    }
    if (!isAllowedOrigin(req)) {
      return errorJson(403, 'invalid_origin', 'INVALID_ORIGIN')
    }

    const rateKey = buildRateLimitKey(req, session.user.id)
    const limitState = await rateLimit({
      bucket: 'xrpl-swap-prepare',
      key: rateKey,
      limit: 20,
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

    const bodyResult = await readJsonBody(req, { maxBytes: 8_192 })
    if (!bodyResult.ok) return bodyResult.response

    const parsed = schema.safeParse(bodyResult.data)
    if (!parsed.success) {
      return errorJson(400, 'invalid_payload', 'Invalid XRPL swap prepare payload', parsed.error.format())
    }

    if (!isValidClassicAddress(parsed.data.account)) {
      return errorJson(400, 'invalid_account', 'Invalid XRPL account')
    }

    const requestedNetwork = parsed.data.network?.trim()
    if (requestedNetwork && !isXrplNetworkId(requestedNetwork)) {
      return errorJson(400, 'invalid_network', 'Invalid XRPL network')
    }
    const networkId =
      requestedNetwork && isXrplNetworkId(requestedNetwork)
        ? requestedNetwork
        : DEFAULT_XRPL_NETWORK_ID

    const client = await getXrplClient(networkId)
    if (!(await doesXrplAccountExist(client, parsed.data.account))) {
      return errorJson(
        400,
        'account_not_activated',
        'This XRPL wallet is not active on the selected network. Add XRP to activate it first.',
      )
    }

    const risk = await assessXrplActionRisk({
      walletId: parsed.data.account,
      userId: session.user.id,
      amountUnits: parsed.data.sourceAmount.value,
      idempotencyKey: parsed.data.idempotencyKey,
      destinationAddress: parsed.data.account,
    })
    if (risk.decision !== 'allow') {
      return errorJson(
        403,
        risk.decision === 'deny' ? 'risk_denied' : 'risk_review',
        risk.decision === 'deny' ? 'RISK_DENIED' : 'RISK_REVIEW',
        { score: risk.score, reasons: risk.reasons },
      )
    }

    const quote = await quoteXrplSwap({
      networkId,
      account: parsed.data.account,
      sourceAmount: parsed.data.sourceAmount,
      destinationAsset: parsed.data.destinationAsset,
      slippageBps: parsed.data.slippageBps,
    })
    const transaction = buildSwapPaymentTx({
      account: parsed.data.account,
      quote,
    })

    return okJson({
      network: networkId,
      account: parsed.data.account,
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
      transaction,
    })
  } catch (error) {
    logError('xrpl-trade-swap-prepare', error)
    const message = getErrorMessage(error, 'Unable to prepare XRPL swap')
    return errorJson(resolveRouteStatus(message), 'swap_prepare_failed', message)
  }
}

export const POST = withApiRoute(
  { scope: 'api:xrpl-trade-swap-prepare', timeoutMs: 20_000 },
  postXrplTradeSwapPrepare,
)
