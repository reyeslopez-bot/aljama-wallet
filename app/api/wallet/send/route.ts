// app/api/wallet/send/route.ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAddress, JsonRpcProvider, Transaction, Wallet } from 'ethers'
import { approveTransfer } from '@/infra/agentic/wallet-policy'
import { getDecryptedWallet, getSpentTodayWei, getWalletByAddress, recordTransaction } from '@/services/wallet.service'
import { requireSession, isAdminEmail } from '@/lib/security/session'
import { isAllowedOrigin } from '@/lib/security/origin'
import { buildRateLimitKey, rateLimit } from '@/lib/security/rate-limit'
import { reserveIdempotencyKey } from '@/services/idempotency.service'
import { userOwnsWallet } from '@/services/wallet-ownership.service'
import { isStrictMode } from '@/lib/security/runtime'
import { assessTransferRisk } from '@/services/transfer-risk.service'
import { recordTransferAttempt, updateTransferStatus } from '@/services/transfer-log.service'
import { errorJson } from '@/lib/security/api-response'
import { readJsonBody } from '@/lib/security/request-body'
import { logError } from '@/lib/security/logging'
import { getErrorMessage } from '@/lib/security/errors'
import { recordSecuritySignal } from '@/services/security-anomaly.service'
import { extractRequestSignalContext } from '@/lib/security/request-signal'

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

type SendRequest = z.infer<typeof sendSchema>

const MAX_UINT256 = (1n << 256n) - 1n

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

function readDailyLimitWei(): bigint {
  const raw = process.env.WALLET_DAILY_LIMIT_WEI
  if (raw === undefined || raw === null || raw === '') {
    if (isStrictMode) throw new Error('Missing WALLET_DAILY_LIMIT_WEI')
    return MAX_UINT256
  }
  const parsed = BigInt(raw)
  return parsed
}

function safeUuid() {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error('crypto.randomUUID unavailable')
  }
  return globalThis.crypto.randomUUID()
}

async function buildUnsignedTx(
  input: SendRequest,
  walletAddress: string,
  provider: JsonRpcProvider,
) {
  const value = BigInt(input.amountWei)

  if (value <= 0n || value > MAX_UINT256) {
    throw new Error('Amount must be greater than 0')
  }

  const to = getAddress(input.to)

  const nonce = input.nonce ?? (await provider.getTransactionCount(walletAddress, 'latest'))
  const feeData = await provider.getFeeData()

  let gasLimit: bigint
  if (input.gasLimit) {
    gasLimit = BigInt(input.gasLimit)
  } else {
    const estimated = await provider.estimateGas({
      from: walletAddress,
      to,
      value,
    })
    gasLimit = BigInt(estimated.toString())
    // add a small buffer
    gasLimit = gasLimit + gasLimit / 5n
  }

  const maxFeePerGas = input.maxFeePerGasWei
    ? BigInt(input.maxFeePerGasWei)
    : feeData.maxFeePerGas ?? null
  let maxPriorityFeePerGas = input.maxPriorityFeePerGasWei
    ? BigInt(input.maxPriorityFeePerGasWei)
    : feeData.maxPriorityFeePerGas ?? null

  const gasPrice = feeData.gasPrice ?? null

  if (!maxFeePerGas && !gasPrice) {
    throw new Error('Unable to determine gas fees')
  }

  if (maxFeePerGas && !maxPriorityFeePerGas) {
    maxPriorityFeePerGas = 0n
  }

  return {
    to,
    value,
    nonce,
    chainId: input.chainId,
    gasLimit,
    maxFeePerGas: maxFeePerGas ?? undefined,
    maxPriorityFeePerGas: maxPriorityFeePerGas ?? undefined,
    gasPrice: maxFeePerGas ? undefined : gasPrice ?? undefined,
  }
}

export async function sendWalletRequest(req: Request, walletIdOverride?: string) {
  let transferLogId: string | null = null
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
    })
    if (!limit.ok) {
      await trackSignal({
        outcome: 'blocked',
        statusCode: 429,
        userId: session.user.id,
        details: { reason: 'rate_limited', retryAfter: limit.retryAfter },
      })
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

    const wallet = await getDecryptedWallet(input.walletId)

    const correlationId = safeUuid()
    const idempotencyKey = input.idempotencyKey

    const unsignedTx = await buildUnsignedTx(input, wallet.address, provider)

    const spentTodayWei = await getSpentTodayWei(input.walletId, input.chainId)
    const dailyLimitWei = readDailyLimitWei()

    const intent = approveTransfer(
      {
        type: 'Transfer',
        chainId: input.chainId,
        fromWalletId: input.walletId,
        to: getAddress(input.to),
        amountWei: input.amountWei,
        maxFeePerGasWei: input.maxFeePerGasWei,
        nonce: unsignedTx.nonce,
        idempotencyKey,
        correlationId,
      },
      {
        userId: process.env.WALLET_ACTOR_USER_ID ?? 'system',
        role: process.env.WALLET_ACTOR_ROLE === 'user' ? 'user' : 'admin',
        dailyLimitWei,
        spentTodayWei,
        allowChains: allowedChains.size > 0 ? allowedChains : new Set([input.chainId]),
      },
    )

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

      return errorJson(
        403,
        risk.decision === 'deny' ? 'risk_denied' : 'risk_review',
        risk.decision === 'deny' ? 'RISK_DENIED' : 'RISK_REVIEW',
        { score: risk.score, reasons: risk.reasons },
      )
    }

    await reserveIdempotencyKey({
      scope: `wallet.send:${input.walletId}`,
      key: input.idempotencyKey,
      ttlMs: 10 * 60 * 1000,
    })

    const log = await recordTransferAttempt({
      walletId: intent.fromWalletId,
      userId: session.user.id,
      chainId: intent.chainId,
      toAddress: intent.to,
      amountWei: BigInt(intent.amountWei),
      status: 'approved',
      idempotencyKey: intent.idempotencyKey,
    })
    transferLogId = log.id

    const signer = new Wallet(wallet.privateKey, provider)
    const signedTx = await signer.signTransaction(unsignedTx)
    const derivedHash = Transaction.from(signedTx).hash ?? undefined

    const txHash = await provider.send('eth_sendRawTransaction', [signedTx])
    if (transferLogId) {
      await updateTransferStatus(transferLogId, 'broadcast')
    }

    let recorded = false
    const recipient = await getWalletByAddress(intent.to).catch(() => null)
    if (recipient) {
      await recordTransaction({
        chainId: intent.chainId,
        fromWalletId: intent.fromWalletId,
        toWalletId: recipient.id,
        valueWei: BigInt(intent.amountWei),
        asset: 'native',
      })
      recorded = true
    }

    await trackSignal({
      outcome: 'success',
      statusCode: 200,
      userId: session.user.id,
      details: {
        walletId: intent.fromWalletId,
        chainId: intent.chainId,
        amountWei: intent.amountWei,
        toAddress: intent.to,
        txHash,
      },
    })

    return NextResponse.json({
      ok: true,
      walletId: intent.fromWalletId,
      to: intent.to,
      amountWei: intent.amountWei,
      chainId: intent.chainId,
      correlationId,
      idempotencyKey,
      signedTx,
      txHash,
      derivedHash,
      recorded,
    })
  } catch (error) {
    if (transferLogId) {
      await updateTransferStatus(transferLogId, 'failed').catch(() => {})
    }
    const message = getErrorMessage(error, 'Failed to send transaction')
    const status = message === 'IDEMPOTENCY_REPLAY' ? 409 : 400
    logError('wallet-send', error)
    await trackSignal({
      outcome: 'failure',
      statusCode: status,
      details: {
        reason: message === 'IDEMPOTENCY_REPLAY' ? 'idempotency_replay' : 'send_failed',
        message,
      },
    })
    return errorJson(
      status,
      message === 'IDEMPOTENCY_REPLAY' ? 'idempotency_replay' : 'send_failed',
      message,
    )
  }
}

export async function POST(req: Request) {
  return sendWalletRequest(req)
}
