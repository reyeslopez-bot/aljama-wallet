import { z } from 'zod'
import { requireSession } from '@/lib/security/session'
import { isAllowedOrigin } from '@/lib/security/origin'
import { buildRateLimitKey, rateLimit } from '@/lib/security/rate-limit'
import { errorJson, okJson } from '@/lib/security/api-response'
import { getErrorMessage } from '@/lib/security/errors'
import { logError } from '@/lib/security/logging'
import { DEFAULT_XRPL_NETWORK_ID, isXrplNetworkId } from '@/lib/xrpl-networks'
import { getAllowedIssuerSet } from '@/lib/xrpl-issued-assets'
import { getXrplSignerAddress } from '@/lib/xrpl-signer'
import { createXrplAction, updateXrplAction } from '@/services/xrpl-action-log.service'
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

export async function POST(req: Request) {
  let actionId: string | null = null

  try {
    const session = await requireSession()
    if (!session) {
      return errorJson(401, 'unauthorized', 'UNAUTHORIZED')
    }

    if (!isAllowedOrigin(req)) {
      return errorJson(403, 'invalid_origin', 'INVALID_ORIGIN')
    }

    const rateKey = buildRateLimitKey(req, session.user.id)
    const limitState = rateLimit({
      bucket: 'xrpl-trustline-set',
      key: rateKey,
      limit: 20,
      windowMs: 60_000,
    })
    if (!limitState.ok) {
      return errorJson(
        429,
        'rate_limited',
        'RATE_LIMITED',
        { retryAfter: limitState.retryAfter },
        { headers: { 'retry-after': String(limitState.retryAfter) } },
      )
    }

    const body = await req.json().catch(() => ({}))
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

    const account = getXrplSignerAddress()
    const action = await createXrplAction({
      action: 'trustset',
      status: 'queued',
      userId: session.user.id,
      networkId,
      account,
      idempotencyKey: parsed.data.idempotencyKey,
      details: {
        issuer,
        currency,
        limit: parsed.data.limit,
      },
    })
    actionId = action.id

    const risk = await assessXrplActionRisk({
      walletId: account,
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
      scope: `xrpl.trustline.set:${account}`,
      idempotencyKey: parsed.data.idempotencyKey,
      networkId,
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

    return okJson({
      network: networkId,
      actionId: action.id,
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
    logError('xrpl-trustline-set', error)
    const message = getErrorMessage(error, 'Failed to set trustline')
    const status = message === 'IDEMPOTENCY_REPLAY' ? 409 : 400
    return errorJson(
      status,
      message === 'IDEMPOTENCY_REPLAY' ? 'idempotency_replay' : 'trustline_failed',
      message,
    )
  }
}
