import { z } from 'zod'
import { getAddress, JsonRpcProvider } from 'ethers'
import { approveTransfer } from '@/infra/agentic/wallet-policy'
import { buildUnsignedEvmTx } from '@/services/evm-tx.service'
import {
  getSpentTodayWei,
  getWalletSigningAccount,
} from '@/services/wallet.service'
import {
  releaseNonceReservation,
  reserveWalletNonce,
} from '@/services/nonce-reservation.service'
import {
  evaluateStoredWalletPolicies,
  getWalletDailyLimitWei,
  recordPolicyEvents,
} from '@/services/policy.service'
import { requireSession, isAdminEmail } from '@/lib/security/session'
import { isAllowedOrigin } from '@/lib/security/origin'
import { buildRateLimitKey, rateLimit } from '@/lib/security/rate-limit'
import { reserveIdempotencyKey } from '@/services/idempotency.service'
import { userOwnsWallet } from '@/services/wallet-ownership.service'
import { isStrictMode } from '@/lib/security/runtime'
import { assessTransferRisk } from '@/services/transfer-risk.service'
import { recordTransferAttempt, updateTransferStatus } from '@/services/transfer-log.service'
import { errorJson, okJson } from '@/lib/security/api-response'
import { readJsonBody } from '@/lib/security/request-body'
import { logError } from '@/lib/security/logging'
import { getErrorMessage } from '@/lib/security/errors'
import { recordSecuritySignal } from '@/services/security-anomaly.service'
import { extractRequestSignalContext } from '@/lib/security/request-signal'
import { withApiRoute } from '@/lib/security/api-route'
import {
  buildEvmTransactionSigningIntentPayload,
  createWalletSigningIntent,
} from '@/services/signing-intent.service'

export const dynamic = 'force-dynamic'

const sendSchema = z.object({
  walletId: z.string().min(3),
  to: z.string(),
  amountWei: z.string().regex(/^\d+$/),
  chainId: z.number().int().positive(),
  idempotencyKey: z.string().uuid(),
  nonce: z.number().int().nonnegative().optional(),
  gasLimit: z.string().regex(/^\d+$/).optional(),
  maxFeePerGasWei: z.string().regex(/^\d+$/).optional(),
  maxPriorityFeePerGasWei: z.string().regex(/^\d+$/).optional(),
})

function stringifyTxValue(value: string | bigint | number | null | undefined): string | null {
  if (value === null || value === undefined) return null
  return value.toString()
}

function requireRpcUrl() {
  const rpcUrl = process.env.EVM_RPC_URL
  if (!rpcUrl) throw new Error('Missing EVM_RPC_URL')
  if (rpcUrl && process.env.NODE_ENV === 'production' && !rpcUrl.startsWith('https://')) {
    throw new Error('EVM_RPC_URL must use https in production')
  }
  return rpcUrl
}

function parseAllowedChains(): Set<number> {
  const raw = process.env.WALLET_ALLOWED_CHAIN_IDS
  if (!raw) {
    if (isStrictMode) throw new Error('Missing WALLET_ALLOWED_CHAIN_IDS')
    return new Set()
  }
  const entries = raw
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0)
  return new Set(entries)
}

function safeUuid() {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error('crypto.randomUUID unavailable')
  }
  return globalThis.crypto.randomUUID()
}

export async function sendWalletRequest(req: Request, walletIdOverride?: string) {
  let transferLogId: string | null = null
  let nonceReservationId: string | null = null
  let keepNonceReservation = false
  const signalContext = extractRequestSignalContext(req)
  const trackSignal = async (input: {
    outcome: 'success' | 'failure' | 'blocked'
    statusCode: number
    userId?: string | null
    details?: Record<string, unknown>
  }) => {
    try {
      await recordSecuritySignal({
        source: 'wallet.send',
        route: '/api/wallet/send',
        outcome: input.outcome,
        statusCode: input.statusCode,
        ipHash: signalContext.ipHash,
        userId: input.userId ?? null,
        country: signalContext.country,
        latitude: signalContext.latitude,
        longitude: signalContext.longitude,
        userAgent: signalContext.userAgent,
        details: input.details,
      })
    } catch (error) {
      logError('wallet-send:signal', error)
    }
  }

  try {
    const session = await requireSession()
    if (!session) {
      await trackSignal({
        outcome: 'failure',
        statusCode: 401,
        details: { reason: 'unauthorized' },
      })
      return errorJson(401, 'unauthorized', 'UNAUTHORIZED')
    }

    if (!isAllowedOrigin(req)) {
      await trackSignal({
        outcome: 'blocked',
        statusCode: 403,
        userId: session.user.id,
        details: { reason: 'invalid_origin' },
      })
      return errorJson(403, 'invalid_origin', 'INVALID_ORIGIN')
    }

    const rateKey = buildRateLimitKey(req, session.user?.id ?? null)
    const limit = await rateLimit({
      bucket: 'wallet-send',
      key: rateKey,
      limit: 10,
      windowMs: 60_000,
      ...(process.env.NODE_ENV === 'production' ? { requireDistributed: true as const } : {}),
    })
    if (!limit.ok) {
      const reason =
        limit.failureKind === 'backend_unavailable'
          ? 'rate_limit_backend_unavailable'
          : 'rate_limited'
      await trackSignal({
        outcome: 'blocked',
        statusCode: limit.failureKind === 'backend_unavailable' ? 503 : 429,
        userId: session.user.id,
        details: { reason, retryAfter: limit.retryAfter },
      })
      if (limit.failureKind === 'backend_unavailable') {
        return errorJson(
          503,
          'rate_limit_backend_unavailable',
          'RATE_LIMIT_BACKEND_UNAVAILABLE',
          { retryAfter: limit.retryAfter },
          { headers: { 'retry-after': String(limit.retryAfter) } },
        )
      }
      return errorJson(
        429,
        'rate_limited',
        'RATE_LIMITED',
        { retryAfter: limit.retryAfter },
        { headers: { 'retry-after': String(limit.retryAfter) } },
      )
    }

    const bodyResult = await readJsonBody(req, { maxBytes: 8_192 })
    if (!bodyResult.ok) {
      return bodyResult.response
    }

    const body = bodyResult.data
    const bodyObject =
      body && typeof body === 'object' && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : null

    if (walletIdOverride && bodyObject && typeof bodyObject.walletId === 'string') {
      if (bodyObject.walletId !== walletIdOverride) {
        return errorJson(409, 'wallet_id_conflict', 'WALLET_ID_CONFLICT')
      }
    }

    const input = sendSchema.parse({
      ...(bodyObject ?? {}),
      ...(walletIdOverride ? { walletId: walletIdOverride } : {}),
    })

    const isAdmin = isAdminEmail(session.user?.email ?? null)
    if (!isAdmin) {
      const owns = await userOwnsWallet(session.user.id, input.walletId)
      if (!owns) {
        await trackSignal({
          outcome: 'blocked',
          statusCode: 403,
          userId: session.user.id,
          details: { reason: 'wallet_forbidden', walletId: input.walletId },
        })
        return errorJson(403, 'forbidden', 'FORBIDDEN')
      }
    }

    const rpcUrl = requireRpcUrl()
    const provider = new JsonRpcProvider(rpcUrl)

    const allowedChains = parseAllowedChains()
    if (allowedChains.size > 0 && !allowedChains.has(input.chainId)) {
      await trackSignal({
        outcome: 'blocked',
        statusCode: 400,
        userId: session.user.id,
        details: { reason: 'chain_denied', chainId: input.chainId },
      })
      return errorJson(400, 'chain_denied', 'CHAIN_DENIED')
    }

    const network = await provider.getNetwork()
    if (Number(network.chainId) !== input.chainId) {
      await trackSignal({
        outcome: 'blocked',
        statusCode: 400,
        userId: session.user.id,
        details: {
          reason: 'chain_mismatch',
          expectedChainId: input.chainId,
          rpcChainId: Number(network.chainId),
        },
      })
      return errorJson(
        400,
        'chain_mismatch',
        'CHAIN_MISMATCH',
        `RPC chain ${network.chainId.toString()} does not match requested ${input.chainId}`,
      )
    }

    const wallet = await getWalletSigningAccount(input.walletId)
    if (!wallet) {
      throw new Error('WALLET_NOT_FOUND')
    }

    const traceId = safeUuid()
    const idempotencyKey = input.idempotencyKey

    const spentTodayWei = await getSpentTodayWei(input.walletId, input.chainId)
    const dailyLimitWei = await getWalletDailyLimitWei({
      walletId: input.walletId,
      chainType: 'EVM',
      networkId: String(input.chainId),
    })
    const normalizedDestination = getAddress(input.to)
    const storedPolicyEvaluation = await evaluateStoredWalletPolicies({
      walletId: input.walletId,
      chainType: 'EVM',
      networkId: String(input.chainId),
      toAddress: normalizedDestination,
      amountBaseUnits: BigInt(input.amountWei),
      spentInWindowBaseUnits: spentTodayWei,
    })

    if (storedPolicyEvaluation.decision !== 'allow') {
      await recordTransferAttempt({
        walletId: input.walletId,
        userId: session.user.id,
        chainId: input.chainId,
        toAddress: normalizedDestination,
        amountWei: BigInt(input.amountWei),
        status: storedPolicyEvaluation.decision === 'deny' ? 'denied' : 'review',
        idempotencyKey,
        txType: 'transfer',
      })

      await recordPolicyEvents({
        walletId: input.walletId,
        chainType: 'EVM',
        networkId: String(input.chainId),
        idempotencyKey,
        payload: {
          reasons: storedPolicyEvaluation.reasons,
          amountWei: input.amountWei,
          spentTodayWei: spentTodayWei.toString(),
          dailyLimitWei: dailyLimitWei.toString(),
          toAddress: normalizedDestination,
        },
        triggeredPolicies: storedPolicyEvaluation.triggeredPolicies,
      }).catch((error) => {
        logError('wallet-send:policy-events', error)
      })

      await trackSignal({
        outcome: 'blocked',
        statusCode: 403,
        userId: session.user.id,
        details: {
          reason: storedPolicyEvaluation.decision === 'deny' ? 'policy_denied' : 'policy_review',
          walletId: input.walletId,
          policyReasons: storedPolicyEvaluation.reasons,
        },
      })

      return errorJson(
        403,
        storedPolicyEvaluation.decision === 'deny' ? 'policy_denied' : 'policy_review',
        storedPolicyEvaluation.decision === 'deny' ? 'POLICY_DENIED' : 'POLICY_REVIEW',
        { reasons: storedPolicyEvaluation.reasons },
      )
    }

    await reserveIdempotencyKey({
      scope: `wallet.send:${input.walletId}`,
      key: input.idempotencyKey,
      ttlMs: 10 * 60 * 1000,
    })

    const nonceReservation = await reserveWalletNonce({
      walletId: input.walletId,
      walletAddress: wallet.address,
      chainId: input.chainId,
      actionId: traceId,
      provider,
      requestedNonce: input.nonce,
    })
    nonceReservationId = nonceReservation.id

    const unsignedTx = await buildUnsignedEvmTx(
      {
        ...input,
        nonce: nonceReservation.nonce,
      },
      wallet.address,
      provider,
    )

    let intent
    try {
      intent = approveTransfer(
        {
          type: 'Transfer',
          chainId: input.chainId,
          fromWalletId: input.walletId,
          to: normalizedDestination,
          amountWei: input.amountWei,
          maxFeePerGasWei: input.maxFeePerGasWei,
          nonce: nonceReservation.nonce,
          idempotencyKey,
          correlationId: traceId,
        },
        {
          userId: process.env.WALLET_ACTOR_USER_ID ?? 'system',
          role: process.env.WALLET_ACTOR_ROLE === 'user' ? 'user' : 'admin',
          dailyLimitWei,
          spentTodayWei,
          allowChains: allowedChains.size > 0 ? allowedChains : new Set([input.chainId]),
        },
      )
    } catch (error) {
      if (getErrorMessage(error, '') === 'LIMIT') {
        await recordTransferAttempt({
          walletId: input.walletId,
          userId: session.user.id,
          chainId: input.chainId,
          toAddress: normalizedDestination,
          amountWei: BigInt(input.amountWei),
          status: 'denied',
          idempotencyKey,
          txType: 'transfer',
        })
        await recordPolicyEvents({
          walletId: input.walletId,
          chainType: 'EVM',
          networkId: String(input.chainId),
          idempotencyKey,
          payload: {
            reason: 'daily_spend_limit_exceeded',
            amountWei: input.amountWei,
            spentTodayWei: spentTodayWei.toString(),
            dailyLimitWei: dailyLimitWei.toString(),
            toAddress: normalizedDestination,
          },
          triggeredPolicies: [
            {
              id: null,
              policyType: 'daily_spend_limit',
              decision: 'deny',
              eventType: 'limit_exceeded',
              reason: 'daily_spend_limit_exceeded',
              limitAmount: dailyLimitWei.toString(),
              timeWindow: 'utc_day',
              config: null,
            },
          ],
        }).catch((policyError) => {
          logError('wallet-send:policy-limit', policyError)
        })
        if (nonceReservationId) {
          await releaseNonceReservation(nonceReservationId).catch(() => {})
          nonceReservationId = null
        }

        return errorJson(403, 'limit_exceeded', 'LIMIT_EXCEEDED')
      }

      throw error
    }

    const risk = await assessTransferRisk({
      walletId: intent.fromWalletId,
      userId: session.user.id,
      chainId: intent.chainId,
      toAddress: intent.to,
      amountWei: intent.amountWei,
      dailyLimitWei,
      spentTodayWei,
      idempotencyKey: intent.idempotencyKey,
    })

    if (risk.decision !== 'allow') {
      await recordTransferAttempt({
        walletId: intent.fromWalletId,
        userId: session.user.id,
        chainId: intent.chainId,
        toAddress: intent.to,
        amountWei: BigInt(intent.amountWei),
        status: risk.decision === 'deny' ? 'denied' : 'review',
        idempotencyKey: intent.idempotencyKey,
        txType: 'transfer',
      })

      await trackSignal({
        outcome: 'blocked',
        statusCode: 403,
        userId: session.user.id,
        details: {
          reason: risk.decision === 'deny' ? 'risk_denied' : 'risk_review',
          score: risk.score,
          reasons: risk.reasons,
          walletId: intent.fromWalletId,
        },
      })
      if (nonceReservationId) {
        await releaseNonceReservation(nonceReservationId).catch(() => {})
        nonceReservationId = null
      }

      return errorJson(
        403,
        risk.decision === 'deny' ? 'risk_denied' : 'risk_review',
        risk.decision === 'deny' ? 'RISK_DENIED' : 'RISK_REVIEW',
        { score: risk.score, reasons: risk.reasons },
      )
    }

    const log = await recordTransferAttempt({
      walletId: intent.fromWalletId,
      userId: session.user.id,
      chainId: intent.chainId,
      toAddress: intent.to,
      amountWei: BigInt(intent.amountWei),
      status: 'created',
      idempotencyKey: intent.idempotencyKey,
      txType: 'transfer',
    })
    transferLogId = log.id

    await updateTransferStatus(log.id, 'pending_broadcast', {
      nonce: stringifyTxValue(unsignedTx.nonce ?? null),
      txType: 'transfer',
      data: null,
      gasLimit: stringifyTxValue(unsignedTx.gasLimit ?? null),
      gasPrice: stringifyTxValue(unsignedTx.gasPrice ?? null),
      maxFeePerGas: stringifyTxValue(unsignedTx.maxFeePerGas ?? null),
      maxPriorityFeePerGas: stringifyTxValue(unsignedTx.maxPriorityFeePerGas ?? null),
    })

    const signingIntent = await createWalletSigningIntent({
      walletId: intent.fromWalletId,
      userId: session.user.id,
      chainId: intent.chainId,
      idempotencyKey: intent.idempotencyKey,
      traceId,
      transferLogId: log.id,
      payload: buildEvmTransactionSigningIntentPayload({
        walletId: intent.fromWalletId,
        chainId: intent.chainId,
        nonceReservationId,
        fromAddress: wallet.address,
        toAddress: intent.to,
        amountWei: intent.amountWei,
        txType: 'transfer',
        data: null,
        transferLogId: log.id,
        transaction: unsignedTx,
      }),
    })
    keepNonceReservation = true

    await trackSignal({
      outcome: 'success',
      statusCode: 202,
      userId: session.user.id,
      details: {
        walletId: intent.fromWalletId,
        chainId: intent.chainId,
        amountWei: intent.amountWei,
        toAddress: intent.to,
        intentId: signingIntent.id,
      },
    })

    return okJson({
      intentId: signingIntent.id,
      status: signingIntent.status,
      walletId: intent.fromWalletId,
      to: intent.to,
      amountWei: intent.amountWei,
      chainId: intent.chainId,
      traceId,
      correlationId: traceId,
      idempotencyKey,
      transferLogId: log.id,
    }, { status: 202 })
  } catch (error) {
    if (nonceReservationId && !keepNonceReservation) {
      await releaseNonceReservation(nonceReservationId).catch(() => {})
    }
    if (transferLogId) {
      await updateTransferStatus(transferLogId, 'failed').catch(() => {})
    }
    const message = getErrorMessage(error, 'Failed to send transaction')
    const isReplay = message === 'IDEMPOTENCY_REPLAY' || message === 'SIGNING_INTENT_REPLAY'
    const isNonceConflict = message === 'NONCE_TOO_LOW' || message === 'NONCE_ALREADY_RESERVED'
    const status = isReplay || isNonceConflict ? 409 : 400
    logError('wallet-send', error)
    await trackSignal({
      outcome: 'failure',
      statusCode: status,
      details: {
        reason: isReplay ? 'idempotency_replay' : isNonceConflict ? 'nonce_conflict' : 'send_failed',
        message,
      },
    })
    return errorJson(
      status,
      isReplay ? 'idempotency_replay' : isNonceConflict ? 'nonce_conflict' : 'send_failed',
      message,
    )
  }
}

export const POST = withApiRoute({ scope: 'api:wallet-send', timeoutMs: 20_000 }, async (req) =>
  sendWalletRequest(req),
)
