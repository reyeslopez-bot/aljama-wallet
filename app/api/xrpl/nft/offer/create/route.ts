import { isValidClassicAddress, xrpToDrops } from 'xrpl'
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
import { getXrplSignerAccount } from '@/lib/xrpl-signer'

const schema = z.object({
  network: z.string().optional(),
  idempotencyKey: z.string().uuid(),
  nftokenId: z.string().min(10).max(128),
  mode: z.enum(['sell', 'buy']),
  amountXrp: z.string().regex(/^\d+(\.\d+)?$/),
  destination: z.string().optional(),
  owner: z.string().optional(),
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
      bucket: 'xrpl-nft-offer-create',
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
      return errorJson(400, 'invalid_payload', 'Invalid NFT offer payload', parsed.error.format())
    }

    const requestedNetwork = parsed.data.network?.trim()
    if (requestedNetwork && !isXrplNetworkId(requestedNetwork)) {
      return errorJson(400, 'invalid_network', 'Invalid XRPL network')
    }
    const networkId = requestedNetwork && isXrplNetworkId(requestedNetwork)
      ? requestedNetwork
      : DEFAULT_XRPL_NETWORK_ID

    if (parsed.data.destination && !isValidClassicAddress(parsed.data.destination.trim())) {
      return errorJson(400, 'invalid_destination', 'Invalid destination address')
    }
    if (parsed.data.owner && !isValidClassicAddress(parsed.data.owner.trim())) {
      return errorJson(400, 'invalid_owner', 'Invalid owner address')
    }

    const account = getXrplSignerAccount()
    const action = await createXrplAction({
      action: 'nft_offer_create',
      status: 'queued',
      userId: session.user.id,
      networkId,
      account: account.address,
      idempotencyKey: parsed.data.idempotencyKey,
      details: {
        nftokenId: parsed.data.nftokenId,
        mode: parsed.data.mode,
        amountXrp: parsed.data.amountXrp,
      },
    })
    actionId = action.id

    const risk = await assessXrplActionRisk({
      walletId: account.address,
      userId: session.user.id,
      amountUnits: parsed.data.amountXrp,
      idempotencyKey: parsed.data.idempotencyKey,
      destinationAddress: parsed.data.destination ?? parsed.data.owner ?? account.address,
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
      scope: `xrpl.nft.offer.create:${account.address}`,
      idempotencyKey: parsed.data.idempotencyKey,
      networkId,
      accountRef: { kind: 'xrpl-env' },
      tx: {
        TransactionType: 'NFTokenCreateOffer',
        NFTokenID: parsed.data.nftokenId.trim(),
        Amount: xrpToDrops(parsed.data.amountXrp),
        Flags: parsed.data.mode === 'sell' ? 1 : 0,
        ...(parsed.data.destination ? { Destination: parsed.data.destination.trim() } : {}),
        ...(parsed.data.owner ? { Owner: parsed.data.owner.trim() } : {}),
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
    logError('xrpl-nft-offer-create', error)
    const message = getErrorMessage(error, 'Failed to create NFT offer')
    const status = message === 'IDEMPOTENCY_REPLAY' ? 409 : 400
    return errorJson(
      status,
      message === 'IDEMPOTENCY_REPLAY' ? 'idempotency_replay' : 'nft_offer_create_failed',
      message,
    )
  }
}
