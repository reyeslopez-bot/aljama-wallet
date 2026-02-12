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

export async function POST(req: Request) {
  let transferLogId: string | null = null
  try {
    const session = await requireSession()
    if (!session) {
      return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
    }

    if (!isAllowedOrigin(req)) {
      return NextResponse.json({ error: 'INVALID_ORIGIN' }, { status: 403 })
    }

    const rateKey = buildRateLimitKey(req, session.user?.id ?? null)
    const limit = rateLimit({
      bucket: 'wallet-send',
      key: rateKey,
      limit: 10,
      windowMs: 60_000,
    })
    if (!limit.ok) {
      return NextResponse.json(
        { error: 'RATE_LIMITED', retryAfter: limit.retryAfter },
        { status: 429, headers: { 'retry-after': String(limit.retryAfter) } },
      )
    }

    const body = await req.json()
    const input = sendSchema.parse(body)

    const isAdmin = isAdminEmail(session.user?.email ?? null)
    if (!isAdmin) {
      const owns = await userOwnsWallet(session.user.id, input.walletId)
      if (!owns) {
        return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
      }
    }

    const rpcUrl = requireRpcUrl()
    const provider = new JsonRpcProvider(rpcUrl)

    const allowedChains = parseAllowedChains()
    if (allowedChains.size > 0 && !allowedChains.has(input.chainId)) {
      return NextResponse.json({ error: 'CHAIN_DENIED' }, { status: 400 })
    }

    const network = await provider.getNetwork()
    if (Number(network.chainId) !== input.chainId) {
      return NextResponse.json(
        {
          error: 'CHAIN_MISMATCH',
          details: `RPC chain ${network.chainId.toString()} does not match requested ${input.chainId}`,
        },
        { status: 400 },
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

      return NextResponse.json(
        {
          error: risk.decision === 'deny' ? 'RISK_DENIED' : 'RISK_REVIEW',
          risk: { score: risk.score, reasons: risk.reasons },
        },
        { status: 403 },
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
    const message = error instanceof Error ? error.message : 'Failed to send transaction'
    const status = message === 'IDEMPOTENCY_REPLAY' ? 409 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
