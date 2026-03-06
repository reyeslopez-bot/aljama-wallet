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
import { toXrplAmount } from '@/lib/xrpl-amount'
import { createXrplAction, updateXrplAction } from '@/services/xrpl-action-log.service'
import { submitXrplTx } from '@/services/xrpl-tx-submit.service'
import { assessXrplActionRisk } from '@/services/xrpl-risk.service'
import { getXrplSignerAccount } from '@/lib/xrpl-signer'

const TF_PASSIVE = 0x00010000
const TF_IMMEDIATE_OR_CANCEL = 0x00020000
const TF_FILL_OR_KILL = 0x00040000
const TF_SELL = 0x00080000

const amountSchema = z.object({
  currency: z.string().min(3).max(40),
  issuer: z.string().min(25).max(80).optional(),
  value: z.string().regex(/^\d+(\.\d+)?$/),
})

const schema = z.object({
  network: z.string().optional(),
  idempotencyKey: z.string().uuid(),
  takerGets: amountSchema,
  takerPays: amountSchema,
  passive: z.boolean().optional(),
  immediateOrCancel: z.boolean().optional(),
  fillOrKill: z.boolean().optional(),
  sell: z.boolean().optional(),
})

function buildFlags(input: z.infer<typeof schema>): number | undefined {
  let flags = 0
  if (input.passive) flags |= TF_PASSIVE
  if (input.immediateOrCancel) flags |= TF_IMMEDIATE_OR_CANCEL
  if (input.fillOrKill) flags |= TF_FILL_OR_KILL
  if (input.sell) flags |= TF_SELL
  return flags > 0 ? flags : undefined
}

async function postXrplTradeOfferCreate(req: Request) {
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
      bucket: 'xrpl-offer-create',
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
      return errorJson(400, 'invalid_payload', 'Invalid offer payload', parsed.error.format())
    }

    const network = parsed.data.network?.trim()
    if (network && !isXrplNetworkId(network)) {
      return errorJson(400, 'invalid_network', 'Invalid XRPL network')
    }
    const networkId = network && isXrplNetworkId(network) ? network : DEFAULT_XRPL_NETWORK_ID

    const getsCurrency = parsed.data.takerGets.currency.trim().toUpperCase()
    const paysCurrency = parsed.data.takerPays.currency.trim().toUpperCase()
    if (getsCurrency !== 'XRP' && !parsed.data.takerGets.issuer?.trim()) {
      return errorJson(400, 'issuer_required', 'Issuer required for non-XRP takerGets')
    }
    if (paysCurrency !== 'XRP' && !parsed.data.takerPays.issuer?.trim()) {
      return errorJson(400, 'issuer_required', 'Issuer required for non-XRP takerPays')
    }

    const account = getXrplSignerAccount()
    const action = await createXrplAction({
      action: 'offer_create',
      status: 'queued',
      userId: session.user.id,
      networkId,
      account: account.address,
      idempotencyKey: parsed.data.idempotencyKey,
      details: {
        takerGets: parsed.data.takerGets,
        takerPays: parsed.data.takerPays,
      },
    })
    actionId = action.id

    const risk = await assessXrplActionRisk({
      walletId: account.address,
      userId: session.user.id,
      amountUnits: parsed.data.takerPays.value,
      idempotencyKey: parsed.data.idempotencyKey,
      destinationAddress: parsed.data.takerGets.issuer ?? account.address,
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
      scope: `xrpl.trade.offer.create:${account.address}`,
      idempotencyKey: parsed.data.idempotencyKey,
      networkId,
      accountRef: { kind: 'xrpl-env' },
      tx: {
        TransactionType: 'OfferCreate',
        TakerGets: toXrplAmount(parsed.data.takerGets),
        TakerPays: toXrplAmount(parsed.data.takerPays),
        ...(buildFlags(parsed.data) !== undefined ? { Flags: buildFlags(parsed.data) } : {}),
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
    logError('xrpl-offer-create', error)
    const message = getErrorMessage(error, 'Failed to create offer')
    const status = message === 'IDEMPOTENCY_REPLAY' ? 409 : 400
    return errorJson(
      status,
      message === 'IDEMPOTENCY_REPLAY' ? 'idempotency_replay' : 'offer_create_failed',
      message,
    )
  }
}

export const POST = withApiRoute(
  { scope: 'api:xrpl-trade-offer-create', timeoutMs: 20_000 },
  postXrplTradeOfferCreate,
)
