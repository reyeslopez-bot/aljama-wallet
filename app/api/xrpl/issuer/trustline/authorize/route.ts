import { TrustSetFlags } from 'xrpl'
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
import { normalizeIssuedCurrency, normalizeXrplClassicAddress } from '@/lib/xrpl-issuer'
import { getXrplSignerAccount } from '@/lib/xrpl-signer'
import { createXrplAction, updateXrplAction } from '@/services/xrpl-action-log.service'
import { recordXrplTransactionSubmission } from '@/services/xrpl-transaction-store.service'
import { submitXrplTx } from '@/services/xrpl-tx-submit.service'
import { assessXrplActionRisk } from '@/services/xrpl-risk.service'

const schema = z.object({
  network: z.string().optional(),
  holder: z.string().min(25).max(80),
  currency: z.string().min(3).max(40),
  idempotencyKey: z.string().uuid(),
})

function resolveRouteStatus(message: string): number {
  if (message === 'IDEMPOTENCY_REPLAY') return 409
  if (/Missing XRPL signer/i.test(message)) return 503
  if (
    message === 'Issued currency is required' ||
    message === 'Issued currency must not be XRP' ||
    message === 'Invalid holder address'
  ) {
    return 400
  }
  return 400
}

async function postXrplIssuerTrustlineAuthorize(
  req: Request,
  routeContext: Pick<ApiRouteContext, 'requestId' | 'traceId' | 'correlationId'>,
) {
  let actionId: string | null = null
  const routePath = '/api/xrpl/issuer/trustline/authorize'

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
      bucket: 'xrpl-issuer-trustline-authorize',
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
      return errorJson(400, 'invalid_payload', 'Invalid trustline authorization payload', parsed.error.format())
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
    const holder = normalizeXrplClassicAddress(parsed.data.holder, 'holder address')
    const currency = normalizeIssuedCurrency(parsed.data.currency)

    const action = await createXrplAction({
      action: 'trustline_authorize',
      status: 'queued',
      userId: session.user.id,
      networkId,
      account: account.address,
      idempotencyKey: parsed.data.idempotencyKey,
      traceId: routeContext.traceId,
      details: {
        holder,
        currency,
      },
    })
    actionId = action.id

    const risk = await assessXrplActionRisk({
      walletId: account.address,
      userId: session.user.id,
      amountUnits: '0',
      idempotencyKey: parsed.data.idempotencyKey,
      destinationAddress: holder,
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

    const result = await submitXrplTx({
      scope: `xrpl.issuer.trustline.authorize:${account.address}`,
      idempotencyKey: parsed.data.idempotencyKey,
      networkId,
      accountRef: { kind: 'xrpl-env' },
      tx: {
        TransactionType: 'TrustSet',
        LimitAmount: {
          currency,
          issuer: holder,
          value: '0',
        },
        Flags: TrustSetFlags.tfSetfAuth,
      },
    })

    await updateXrplAction({
      id: action.id,
      status: result.validated ? 'validated' : 'submitted',
      txHash: result.txHash,
      engineResult: result.engineResult,
      details: {
        ...(action.details ?? {}),
        sequence: result.sequence,
        ledgerIndex: result.ledgerIndex,
      },
    })

    try {
      await recordXrplTransactionSubmission({ actionId: action.id, result })
    } catch (recordError) {
      logError('xrpl-issuer-trustline-authorize:transaction-store', recordError, {
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
      authorization: {
        issuer: account.address,
        holder,
        currency,
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

    const message = getErrorMessage(error, 'Failed to authorize trustline')
    const status = resolveRouteStatus(message)
    if (status >= 500) {
      logError('xrpl-issuer-trustline-authorize', error, {
        requestId: routeContext.requestId,
        traceId: routeContext.traceId,
        route: routePath,
        actionId,
      })
    }

    return errorJson(
      status,
      message === 'IDEMPOTENCY_REPLAY' ? 'idempotency_replay' : 'trustline_authorize_failed',
      message,
    )
  }
}

export const POST = withApiRoute(
  { scope: 'api:xrpl-issuer-trustline-authorize', timeoutMs: 20_000 },
  postXrplIssuerTrustlineAuthorize,
)
