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
import { createXrplAction, updateXrplAction } from '@/services/xrpl-action-log.service'
import { recordXrplTransactionSubmission } from '@/services/xrpl-transaction-store.service'
import { submitXrplTx } from '@/services/xrpl-tx-submit.service'
import { assessXrplActionRisk } from '@/services/xrpl-risk.service'
import { getXrplSignerAccount } from '@/lib/xrpl-signer'
import { isAllowedNftUri, utf8ToHex } from '@/lib/xrpl-nft-metadata'

const schema = z.object({
  network: z.string().optional(),
  uri: z.string().min(1).max(2048),
  taxon: z.number().int().nonnegative().optional(),
  transferFee: z.number().int().min(0).max(50000).optional(),
  flags: z.number().int().nonnegative().optional(),
  idempotencyKey: z.string().uuid(),
})

async function postXrplNftMint(req: Request) {
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
      bucket: 'xrpl-nft-mint',
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

    const body = bodyResult.data
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return errorJson(400, 'invalid_payload', 'Invalid NFT mint payload', parsed.error.format())
    }

    const requestedNetwork = parsed.data.network?.trim()
    if (requestedNetwork && !isXrplNetworkId(requestedNetwork)) {
      return errorJson(400, 'invalid_network', 'Invalid XRPL network')
    }
    const networkId = requestedNetwork && isXrplNetworkId(requestedNetwork)
      ? requestedNetwork
      : DEFAULT_XRPL_NETWORK_ID

    if (!isAllowedNftUri(parsed.data.uri)) {
      return errorJson(400, 'invalid_uri', 'NFT metadata URI scheme is not allowed')
    }

    const account = getXrplSignerAccount()
    const action = await createXrplAction({
      action: 'nft_mint',
      status: 'queued',
      userId: session.user.id,
      networkId,
      account: account.address,
      idempotencyKey: parsed.data.idempotencyKey,
      details: {
        uri: parsed.data.uri,
        taxon: parsed.data.taxon ?? 0,
      },
    })
    actionId = action.id

    const risk = await assessXrplActionRisk({
      walletId: account.address,
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
      scope: `xrpl.nft.mint:${account.address}`,
      idempotencyKey: parsed.data.idempotencyKey,
      networkId,
      accountRef: { kind: 'xrpl-env' },
      tx: {
        TransactionType: 'NFTokenMint',
        URI: utf8ToHex(parsed.data.uri),
        NFTokenTaxon: parsed.data.taxon ?? 0,
        ...(parsed.data.transferFee !== undefined ? { TransferFee: parsed.data.transferFee } : {}),
        ...(parsed.data.flags !== undefined ? { Flags: parsed.data.flags } : {}),
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
      logError('xrpl-nft-mint:transaction-store', recordError)
    }

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
    logError('xrpl-nft-mint', error)
    const message = getErrorMessage(error, 'Failed to mint NFT')
    const status = message === 'IDEMPOTENCY_REPLAY' ? 409 : 400
    return errorJson(
      status,
      message === 'IDEMPOTENCY_REPLAY' ? 'idempotency_replay' : 'nft_mint_failed',
      message,
    )
  }
}

export const POST = withApiRoute({ scope: 'api:xrpl-nft-mint', timeoutMs: 20_000 }, postXrplNftMint)
