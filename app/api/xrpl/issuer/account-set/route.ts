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
import {
  XRPL_ISSUER_ACCOUNT_FLAG_NAMES,
  encodeXrplIssuerDomain,
  normalizeXrplIssuerDomain,
  resolveXrplIssuerAccountFlag,
  transferFeeBpsToTransferRate,
} from '@/lib/xrpl-issuer'
import { createXrplAction, updateXrplAction } from '@/services/xrpl-action-log.service'
import { upsertXrplIssuerProgram } from '@/services/xrpl-issuer-policy.service'
import { getConfiguredXrplAccountRef, resolveConfiguredXrplAccount } from '@/services/xrpl-runtime-signer.service'
import { recordXrplTransactionSubmission } from '@/services/xrpl-transaction-store.service'
import { submitXrplTx } from '@/services/xrpl-tx-submit.service'
import { assessXrplActionRisk } from '@/services/xrpl-risk.service'

const issuerFlagSchema = z.enum(XRPL_ISSUER_ACCOUNT_FLAG_NAMES)

const schema = z
  .object({
    network: z.string().optional(),
    domain: z.string().max(255).optional(),
    transferFeeBps: z.number().int().min(0).max(10_000).optional(),
    tickSize: z.number().int().min(0).max(15).optional(),
    setFlag: issuerFlagSchema.optional(),
    clearFlag: issuerFlagSchema.optional(),
    idempotencyKey: z.string().uuid(),
  })
  .superRefine((value, ctx) => {
    if (
      value.domain === undefined &&
      value.transferFeeBps === undefined &&
      value.tickSize === undefined &&
      value.setFlag === undefined &&
      value.clearFlag === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one account setting is required',
        path: ['domain'],
      })
    }
    if (value.tickSize !== undefined && value.tickSize !== 0 && (value.tickSize < 3 || value.tickSize > 15)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Tick size must be 0 or between 3 and 15',
        path: ['tickSize'],
      })
    }
    if (value.setFlag && value.clearFlag && value.setFlag === value.clearFlag) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Set and clear flags must differ',
        path: ['clearFlag'],
      })
    }
  })

function resolveRouteStatus(message: string): number {
  if (message === 'IDEMPOTENCY_REPLAY') return 409
  if (/Missing XRPL signer/i.test(message)) return 503
  if (
    message === 'Issuer domain must be a bare hostname' ||
    message === 'Issuer domain must be a valid ASCII hostname' ||
    message === 'Transfer fee bps must be an integer between 0 and 10000'
  ) {
    return 400
  }
  return 400
}

async function postXrplIssuerAccountSet(
  req: Request,
  routeContext: Pick<ApiRouteContext, 'requestId' | 'traceId' | 'correlationId'>,
) {
  let actionId: string | null = null
  const routePath = '/api/xrpl/issuer/account-set'

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
      bucket: 'xrpl-issuer-account-set',
      key: rateKey,
      limit: 10,
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
      return errorJson(400, 'invalid_payload', 'Invalid issuer account settings payload', parsed.error.format())
    }

    const requestedNetwork = parsed.data.network?.trim()
    if (requestedNetwork && !isXrplNetworkId(requestedNetwork)) {
      return errorJson(400, 'invalid_network', 'Invalid XRPL network')
    }
    const networkId =
      requestedNetwork && isXrplNetworkId(requestedNetwork)
        ? requestedNetwork
        : DEFAULT_XRPL_NETWORK_ID

    const domain = normalizeXrplIssuerDomain(parsed.data.domain)
    const transferRate =
      parsed.data.transferFeeBps === undefined
        ? undefined
        : transferFeeBpsToTransferRate(parsed.data.transferFeeBps)
    const setFlag = parsed.data.setFlag ? resolveXrplIssuerAccountFlag(parsed.data.setFlag) : undefined
    const clearFlag = parsed.data.clearFlag ? resolveXrplIssuerAccountFlag(parsed.data.clearFlag) : undefined

    const account = await resolveConfiguredXrplAccount('issuer')
    const action = await createXrplAction({
      action: 'account_set',
      status: 'queued',
      userId: session.user.id,
      networkId,
      account: account.address,
      idempotencyKey: parsed.data.idempotencyKey,
      traceId: routeContext.traceId,
      details: {
        domain,
        transferFeeBps: parsed.data.transferFeeBps,
        transferRate,
        tickSize: parsed.data.tickSize,
        setFlag: parsed.data.setFlag,
        clearFlag: parsed.data.clearFlag,
      },
    })
    actionId = action.id

    const risk = await assessXrplActionRisk({
      walletId: account.address,
      userId: session.user.id,
      amountUnits: String(parsed.data.transferFeeBps ?? 0),
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

    const result = await submitXrplTx({
      scope: `xrpl.issuer.account-set:${account.address}`,
      idempotencyKey: parsed.data.idempotencyKey,
      networkId,
      accountRef: getConfiguredXrplAccountRef('issuer'),
      tx: {
        TransactionType: 'AccountSet',
        ...(domain ? { Domain: encodeXrplIssuerDomain(domain) } : {}),
        ...(transferRate !== undefined ? { TransferRate: transferRate } : {}),
        ...(parsed.data.tickSize !== undefined ? { TickSize: parsed.data.tickSize } : {}),
        ...(setFlag !== undefined ? { SetFlag: setFlag } : {}),
        ...(clearFlag !== undefined ? { ClearFlag: clearFlag } : {}),
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
      logError('xrpl-issuer-account-set:transaction-store', recordError, {
        requestId: routeContext.requestId,
        traceId: routeContext.traceId,
        route: routePath,
        actionId: action.id,
        txHash: result.txHash,
      })
    }

    try {
      await upsertXrplIssuerProgram({
        networkId,
        issuerAccount: account.address,
        status: 'active',
        ...(domain !== undefined ? { domain } : {}),
        ...(parsed.data.transferFeeBps !== undefined ? { transferFeeBps: parsed.data.transferFeeBps } : {}),
        ...(parsed.data.tickSize !== undefined ? { tickSize: parsed.data.tickSize } : {}),
        createdByUserId: session.user.id,
      })
    } catch (policyError) {
      logError('xrpl-issuer-account-set:policy-sync', policyError, {
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
      issuerAccount: {
        address: account.address,
        domain,
        transferFeeBps: parsed.data.transferFeeBps ?? null,
        transferRate: transferRate ?? null,
        tickSize: parsed.data.tickSize ?? null,
        setFlag: parsed.data.setFlag ?? null,
        clearFlag: parsed.data.clearFlag ?? null,
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

    const message = getErrorMessage(error, 'Failed to update issuer account settings')
    const status = resolveRouteStatus(message)
    if (status >= 500) {
      logError('xrpl-issuer-account-set', error, {
        requestId: routeContext.requestId,
        traceId: routeContext.traceId,
        route: routePath,
        actionId,
      })
    }

    return errorJson(
      status,
      message === 'IDEMPOTENCY_REPLAY' ? 'idempotency_replay' : 'issuer_account_set_failed',
      message,
    )
  }
}

export const POST = withApiRoute(
  { scope: 'api:xrpl-issuer-account-set', timeoutMs: 20_000 },
  postXrplIssuerAccountSet,
)
