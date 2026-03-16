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
import { toXrplAmount } from '@/lib/xrpl-amount'
import { getXrplSignerAccount } from '@/lib/xrpl-signer'
import { createXrplAction, updateXrplAction } from '@/services/xrpl-action-log.service'
import {
  createXrplIssuerDistribution,
  requireXrplIssuerHolderEligibility,
  updateXrplIssuerDistribution,
} from '@/services/xrpl-issuer-policy.service'
import { recordXrplTransactionSubmission } from '@/services/xrpl-transaction-store.service'
import { submitXrplTx } from '@/services/xrpl-tx-submit.service'
import { assessXrplActionRisk } from '@/services/xrpl-risk.service'

const schema = z.object({
  network: z.string().optional(),
  destination: z.string().min(25).max(80),
  currency: z.string().min(3).max(40),
  value: z.string().regex(/^\d+(\.\d+)?$/),
  issuer: z.string().min(25).max(80).optional(),
  destinationTag: z.number().int().min(0).max(4_294_967_295).optional(),
  idempotencyKey: z.string().uuid(),
})

function resolveRouteStatus(message: string): number {
  if (message === 'IDEMPOTENCY_REPLAY') return 409
  if (/Missing XRPL signer/i.test(message)) return 503
  if (
    message === 'Issued currency is required' ||
    message === 'Issued currency must not be XRP' ||
    message === 'Invalid destination address' ||
    message === 'Invalid issuer address'
  ) {
    return 400
  }
  if (
    message === 'Issuer asset is not registered' ||
    message === 'Issuer program is not active' ||
    message === 'Issuer asset is not active'
  ) {
    return 409
  }
  if (
    message === 'Holder is not approved for this asset' ||
    message === 'Holder trustline is not authorized for this asset' ||
    message === 'Issuer program does not allow distributions' ||
    message === 'Issuer distributions are disabled for this asset' ||
    message === 'Distribution amount exceeds the configured asset limit'
  ) {
    return 403
  }
  return 400
}

async function postXrplIssuerPayment(
  req: Request,
  routeContext: Pick<ApiRouteContext, 'requestId' | 'traceId' | 'correlationId'>,
) {
  let actionId: string | null = null
  let distributionId: string | null = null
  const routePath = '/api/xrpl/issuer/payment'

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
      bucket: 'xrpl-issuer-payment',
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
      return errorJson(400, 'invalid_payload', 'Invalid issuer payment payload', parsed.error.format())
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
    const destination = normalizeXrplClassicAddress(parsed.data.destination, 'destination address')
    const currency = normalizeIssuedCurrency(parsed.data.currency)
    const issuer = parsed.data.issuer?.trim()
      ? normalizeXrplClassicAddress(parsed.data.issuer, 'issuer address')
      : account.address
    await requireXrplIssuerHolderEligibility({
      networkId,
      issuerAccount: issuer,
      currency,
      holderAddress: destination,
      action: 'distribute',
      amount: parsed.data.value,
    })

    const action = await createXrplAction({
      action: 'issuer_payment',
      status: 'queued',
      userId: session.user.id,
      networkId,
      account: account.address,
      idempotencyKey: parsed.data.idempotencyKey,
      traceId: routeContext.traceId,
      details: {
        destination,
        currency,
        issuer,
        value: parsed.data.value,
        destinationTag: parsed.data.destinationTag,
      },
    })
    actionId = action.id

    const distribution = await createXrplIssuerDistribution({
      networkId,
      issuerAccount: issuer,
      currency,
      destinationAddress: destination,
      amount: parsed.data.value,
      actionId: action.id,
      idempotencyKey: parsed.data.idempotencyKey,
      requestedByUserId: session.user.id,
      details: {
        issuer,
        destinationTag: parsed.data.destinationTag,
      },
    })
    distributionId = distribution.distribution.id

    const risk = await assessXrplActionRisk({
      walletId: account.address,
      userId: session.user.id,
      amountUnits: parsed.data.value,
      idempotencyKey: parsed.data.idempotencyKey,
      destinationAddress: destination,
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
      if (distributionId) {
        await updateXrplIssuerDistribution({
          distributionId,
          status: 'failed',
          failureCode: risk.decision === 'deny' ? 'RISK_DENIED' : 'RISK_REVIEW',
          details: {
            risk,
          },
        }).catch(() => {})
      }
      return errorJson(
        403,
        risk.decision === 'deny' ? 'risk_denied' : 'risk_review',
        risk.decision === 'deny' ? 'RISK_DENIED' : 'RISK_REVIEW',
        { score: risk.score, reasons: risk.reasons },
      )
    }

    const result = await submitXrplTx({
      scope: `xrpl.issuer.payment:${account.address}`,
      idempotencyKey: parsed.data.idempotencyKey,
      networkId,
      accountRef: { kind: 'xrpl-env' },
      tx: {
        TransactionType: 'Payment',
        Destination: destination,
        Amount: toXrplAmount({
          currency,
          issuer,
          value: parsed.data.value,
        }),
        ...(parsed.data.destinationTag !== undefined ? { DestinationTag: parsed.data.destinationTag } : {}),
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
      logError('xrpl-issuer-payment:transaction-store', recordError, {
        requestId: routeContext.requestId,
        traceId: routeContext.traceId,
        route: routePath,
        actionId: action.id,
        txHash: result.txHash,
      })
    }

    if (distributionId) {
      await updateXrplIssuerDistribution({
        distributionId,
        status: result.validated ? 'validated' : 'submitted',
        txHash: result.txHash,
        details: {
          engineResult: result.engineResult,
          ledgerIndex: result.ledgerIndex,
          sequence: result.sequence,
        },
      })
    }

    return okJson({
      network: networkId,
      actionId: action.id,
      traceId: routeContext.traceId,
      correlationId: routeContext.traceId,
      distribution: {
        source: account.address,
        destination,
        currency,
        issuer,
        value: parsed.data.value,
        destinationTag: parsed.data.destinationTag ?? null,
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
    if (distributionId) {
      const failureCode = getErrorMessage(error, 'Failed to distribute issued asset')
      await updateXrplIssuerDistribution({
        distributionId,
        status: 'failed',
        failureCode,
      }).catch(() => {})
    }

    const message = getErrorMessage(error, 'Failed to distribute issued asset')
    const status = resolveRouteStatus(message)
    if (status >= 500) {
      logError('xrpl-issuer-payment', error, {
        requestId: routeContext.requestId,
        traceId: routeContext.traceId,
        route: routePath,
        actionId,
      })
    }

    return errorJson(
      status,
      message === 'IDEMPOTENCY_REPLAY' ? 'idempotency_replay' : 'issuer_payment_failed',
      message,
    )
  }
}

export const POST = withApiRoute(
  { scope: 'api:xrpl-issuer-payment', timeoutMs: 20_000 },
  postXrplIssuerPayment,
)
