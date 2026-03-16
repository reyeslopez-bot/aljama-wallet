import { z } from 'zod'
import { requireSession } from '@/lib/security/session'
import { isAllowedOrigin } from '@/lib/security/origin'
import { buildRateLimitKey, rateLimit } from '@/lib/security/rate-limit'
import { errorJson, okJson } from '@/lib/security/api-response'
import { withApiRoute, type ApiRouteContext } from '@/lib/security/api-route'
import { readJsonBody } from '@/lib/security/request-body'
import { getErrorMessage } from '@/lib/security/errors'
import { logError } from '@/lib/security/logging'
import { DEFAULT_XRPL_NETWORK_ID, isXrplNetworkId } from '@/lib/xrpl-networks'
import { createXrplAction, updateXrplAction } from '@/services/xrpl-action-log.service'
import { assessXrplActionRisk } from '@/services/xrpl-risk.service'
import { recordXrplTransactionSubmission } from '@/services/xrpl-transaction-store.service'
import { submitXrplTx } from '@/services/xrpl-tx-submit.service'
import { buildSwapPaymentTx, quoteXrplSwap } from '@/services/xrpl-swap.service'
import { getXrplSignerAccount } from '@/lib/xrpl-signer'

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
  idempotencyKey: z.string().uuid(),
  sourceAmount: amountSchema,
  destinationAsset: assetSchema,
  slippageBps: z.number().int().min(0).max(MAX_SLIPPAGE_BPS).optional(),
})

function resolveRouteStatus(message: string): number {
  if (message === 'IDEMPOTENCY_REPLAY') return 409
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

async function postXrplTradeSwap(
  req: Request,
  routeContext: Pick<ApiRouteContext, 'requestId' | 'traceId' | 'correlationId'>,
) {
  let actionId: string | null = null
  const routePath = '/api/xrpl/trade/swap'

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
      bucket: 'xrpl-swap-payment',
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
    if (!bodyResult.ok) {
      return bodyResult.response
    }

    const parsed = schema.safeParse(bodyResult.data)
    if (!parsed.success) {
      return errorJson(400, 'invalid_payload', 'Invalid XRPL swap payload', parsed.error.format())
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
    const action = await createXrplAction({
      action: 'swap_payment',
      status: 'queued',
      userId: session.user.id,
      networkId,
      account: account.address,
      idempotencyKey: parsed.data.idempotencyKey,
      traceId: routeContext.traceId,
      details: {
        sourceAmount: parsed.data.sourceAmount,
        destinationAsset: parsed.data.destinationAsset,
        slippageBps: parsed.data.slippageBps ?? undefined,
      },
    })
    actionId = action.id

    const risk = await assessXrplActionRisk({
      walletId: account.address,
      userId: session.user.id,
      amountUnits: parsed.data.sourceAmount.value,
      idempotencyKey: parsed.data.idempotencyKey,
      destinationAddress: account.address,
    })
    if (risk.decision !== 'allow') {
      await updateXrplAction({
        id: action.id,
        status: risk.decision === 'deny' ? 'denied' : 'review',
        details: {
          ...(action.details ?? {}),
          risk,
        },
      })
      return errorJson(
        403,
        risk.decision === 'deny' ? 'risk_denied' : 'risk_review',
        risk.decision === 'deny' ? 'RISK_DENIED' : 'RISK_REVIEW',
        { score: risk.score, reasons: risk.reasons },
      )
    }

    const quote = await quoteXrplSwap({
      networkId,
      account: account.address,
      sourceAmount: parsed.data.sourceAmount,
      destinationAsset: parsed.data.destinationAsset,
      slippageBps: parsed.data.slippageBps,
    })

    const result = await submitXrplTx({
      scope: `xrpl.trade.swap:${account.address}`,
      idempotencyKey: parsed.data.idempotencyKey,
      networkId,
      accountRef: { kind: 'xrpl-env' },
      tx: buildSwapPaymentTx({
        account: account.address,
        quote,
      }),
    })

    await updateXrplAction({
      id: action.id,
      status: result.validated ? 'validated' : 'submitted',
      txHash: result.txHash,
      engineResult: result.engineResult,
      details: {
        ...(action.details ?? {}),
        quotedSourceAmount: quote.quotedSourceAmount,
        destinationAmount: quote.destinationAmount,
        deliverMin: quote.deliverMin,
        pathCount: quote.pathCount,
        alternativeCount: quote.alternativeCount,
        fullReply: quote.fullReply,
        sequence: result.sequence,
        ledgerIndex: result.ledgerIndex,
      },
    })

    try {
      await recordXrplTransactionSubmission({ actionId: action.id, result })
    } catch (recordError) {
      logError('xrpl-trade-swap:transaction-store', recordError, {
        requestId: routeContext.requestId,
        traceId: routeContext.traceId,
        route: routePath,
        actionId: action.id,
        txHash: result.txHash,
      })
    }

    return okJson({
      network: networkId,
      actionId: action.id,
      traceId: routeContext.traceId,
      correlationId: routeContext.traceId,
      tx: {
        hash: result.txHash,
        engineResult: result.engineResult,
        validated: result.validated,
        ledgerIndex: result.ledgerIndex,
      },
      swap: {
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
    if (actionId) {
      await updateXrplAction({
        id: actionId,
        status: 'failed',
      }).catch(() => {})
    }

    const message = getErrorMessage(error, 'Failed to submit XRPL swap payment')
    const status = resolveRouteStatus(message)
    if (status >= 500) {
      logError('xrpl-trade-swap', error, {
        requestId: routeContext.requestId,
        traceId: routeContext.traceId,
        route: routePath,
        actionId,
      })
    }

    return errorJson(
      status,
      message === 'IDEMPOTENCY_REPLAY' ? 'idempotency_replay' : 'xrpl_swap_failed',
      message,
    )
  }
}

export const POST = withApiRoute(
  { scope: 'api:xrpl-trade-swap', timeoutMs: 20_000 },
  postXrplTradeSwap,
)
