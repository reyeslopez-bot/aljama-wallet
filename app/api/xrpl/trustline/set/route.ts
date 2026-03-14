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
import { getAllowedIssuerSet } from '@/lib/xrpl-issued-assets'
import { getXrplSignerAccount } from '@/lib/xrpl-signer'
import { createXrplAction, updateXrplAction } from '@/services/xrpl-action-log.service'
import { recordXrplTransactionSubmission } from '@/services/xrpl-transaction-store.service'
import { submitXrplTx } from '@/services/xrpl-tx-submit.service'
import { assessXrplActionRisk } from '@/services/xrpl-risk.service'

const schema = z.object({
  network: z.string().optional(),
  issuer: z.string().min(25).max(80),
  currency: z.string().min(3).max(40),
  limit: z.string().regex(/^\d+(\.\d+)?$/),
  qualityIn: z.number().int().nonnegative().optional(),
  qualityOut: z.number().int().nonnegative().optional(),
  idempotencyKey: z.string().uuid(),
})

async function postXrplTrustlineSet(
  req: Request,
  routeContext: Pick<ApiRouteContext, 'requestId' | 'traceId' | 'correlationId'>,
) {
  let actionId: string | null = null
  const routePath = '/api/xrpl/trustline/set'

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
      bucket: 'xrpl-trustline-set',
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

    const body = bodyResult.data
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return errorJson(400, 'invalid_payload', 'Invalid trustline payload', parsed.error.format())
    }

    const network = parsed.data.network?.trim()
    if (network && !isXrplNetworkId(network)) {
      return errorJson(400, 'invalid_network', 'Invalid XRPL network')
    }
    const networkId = network && isXrplNetworkId(network) ? network : DEFAULT_XRPL_NETWORK_ID

    const issuer = parsed.data.issuer.trim()
    const currency = parsed.data.currency.trim().toUpperCase()
    const { enabled, allowed } = getAllowedIssuerSet()
    if (enabled && !allowed.has(issuer)) {
      return errorJson(403, 'issuer_not_allowed', 'Issuer is not allowed')
    }

    const account = getXrplSignerAccount()
    const action = await createXrplAction({
      action: 'trustset',
      status: 'queued',
      userId: session.user.id,
      networkId,
      account: account.address,
      idempotencyKey: parsed.data.idempotencyKey,
      traceId: routeContext.traceId,
      details: {
        issuer,
        currency,
        limit: parsed.data.limit,
      },
    })
    actionId = action.id

    const risk = await assessXrplActionRisk({
      walletId: account.address,
      userId: session.user.id,
      amountUnits: parsed.data.limit,
      idempotencyKey: parsed.data.idempotencyKey,
      destinationAddress: issuer,
    })

    if (risk.decision !== 'allow') {
      await updateXrplAction({
        id: action.id,
        status: risk.decision === 'deny' ? 'denied' : 'review',
        details: {
          ...action.details,
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

    const result = await submitXrplTx({
      scope: `xrpl.trustline.set:${account.address}`,
      idempotencyKey: parsed.data.idempotencyKey,
      networkId,
      accountRef: { kind: 'xrpl-env' },
      tx: {
        TransactionType: 'TrustSet',
        LimitAmount: {
          currency,
          issuer,
          value: parsed.data.limit,
        },
        ...(parsed.data.qualityIn !== undefined ? { QualityIn: parsed.data.qualityIn } : {}),
        ...(parsed.data.qualityOut !== undefined ? { QualityOut: parsed.data.qualityOut } : {}),
      },
    })

    await updateXrplAction({
      id: action.id,
      status: result.validated ? 'validated' : 'submitted',
      txHash: result.txHash,
      engineResult: result.engineResult,
      details: {
        ...action.details,
        sequence: result.sequence,
        ledgerIndex: result.ledgerIndex,
      },
    })

    try {
      await recordXrplTransactionSubmission({ actionId: action.id, result })
    } catch (recordError) {
      logError('xrpl-trustline-set:transaction-store', recordError, {
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
      trustline: {
        issuer,
        currency,
        limit: parsed.data.limit,
      },
      tx: {
        hash: result.txHash,
        engineResult: result.engineResult,
        validated: result.validated,
        ledgerIndex: result.ledgerIndex,
      },
    })
  } catch (error) {
    if (actionId) {
      await updateXrplAction({
        id: actionId,
        status: 'failed',
      }).catch(() => {})
    }
    logError('xrpl-trustline-set', error, {
      requestId: routeContext.requestId,
      traceId: routeContext.traceId,
      route: routePath,
      actionId,
    })
    const message = getErrorMessage(error, 'Failed to set trustline')
    const status = message === 'IDEMPOTENCY_REPLAY' ? 409 : 400
    return errorJson(
      status,
      message === 'IDEMPOTENCY_REPLAY' ? 'idempotency_replay' : 'trustline_failed',
      message,
    )
  }
}

export const POST = withApiRoute(
  { scope: 'api:xrpl-trustline-set', timeoutMs: 20_000 },
  postXrplTrustlineSet,
)
