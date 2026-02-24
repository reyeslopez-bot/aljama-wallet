import { z } from 'zod'
import { requireSession } from '@/lib/security/session'
import { isAllowedOrigin } from '@/lib/security/origin'
import { buildRateLimitKey, rateLimit } from '@/lib/security/rate-limit'
import { errorJson, okJson } from '@/lib/security/api-response'
import { readJsonBody } from '@/lib/security/request-body'
import { getErrorMessage } from '@/lib/security/errors'
import { logError } from '@/lib/security/logging'
import { DEFAULT_XRPL_NETWORK_ID, isXrplNetworkId } from '@/lib/xrpl-networks'
import { createXrplAction, updateXrplAction } from '@/services/xrpl-action-log.service'
import { submitXrplTx } from '@/services/xrpl-tx-submit.service'
import { assessXrplActionRisk } from '@/services/xrpl-risk.service'
import { getXrplSignerAddress } from '@/lib/xrpl-signer'

const schema = z.object({
  network: z.string().optional(),
  idempotencyKey: z.string().uuid(),
  offerSequence: z.number().int().positive(),
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
    const limitState = await rateLimit({
      bucket: 'xrpl-offer-cancel',
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

    const bodyResult = await readJsonBody(req, { maxBytes: 8_192 })
    if (!bodyResult.ok) {
      return bodyResult.response
    }

    const body = bodyResult.data
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return errorJson(400, 'invalid_payload', 'Invalid offer cancel payload', parsed.error.format())
    }

    const requestedNetwork = parsed.data.network?.trim()
    if (requestedNetwork && !isXrplNetworkId(requestedNetwork)) {
      return errorJson(400, 'invalid_network', 'Invalid XRPL network')
    }
    const networkId = requestedNetwork && isXrplNetworkId(requestedNetwork)
      ? requestedNetwork
      : DEFAULT_XRPL_NETWORK_ID

    const account = getXrplSignerAddress()
    const action = await createXrplAction({
      action: 'offer_cancel',
      status: 'queued',
      userId: session.user.id,
      networkId,
      account,
      idempotencyKey: parsed.data.idempotencyKey,
      details: {
        offerSequence: parsed.data.offerSequence,
      },
    })
    actionId = action.id

    const risk = await assessXrplActionRisk({
      walletId: account,
      userId: session.user.id,
      amountUnits: '1',
      idempotencyKey: parsed.data.idempotencyKey,
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
      scope: `xrpl.trade.offer.cancel:${account}`,
      idempotencyKey: parsed.data.idempotencyKey,
      networkId,
      tx: {
        TransactionType: 'OfferCancel',
        OfferSequence: parsed.data.offerSequence,
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

    return okJson({
      network: networkId,
      actionId: action.id,
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
    logError('xrpl-offer-cancel', error)
    const message = getErrorMessage(error, 'Failed to cancel offer')
    const status = message === 'IDEMPOTENCY_REPLAY' ? 409 : 400
    return errorJson(
      status,
      message === 'IDEMPOTENCY_REPLAY' ? 'idempotency_replay' : 'offer_cancel_failed',
      message,
    )
  }
}
