import { pathToFileURL } from 'node:url'
import type { JsonRpcProvider, TransactionRequest } from 'ethers'
import { getEvmProviderForChain } from '@/lib/evm-rpc'
import { markReplacedTransferAttempts } from '@/services/chain-transaction-sync.service'
import {
  deriveSignedEvmTxHash,
  signUnsignedEvmTx,
  submitSignedEvmTx,
} from '@/services/evm-tx.service'
import {
  claimNextQueuedWalletSigningIntent,
  markWalletSigningIntentSubmitted,
  markWalletSigningIntentFailed,
  markWalletSigningIntentSigned,
  type EvmTransactionSigningIntentPayload,
} from '@/services/signing-intent.service'
import {
  markNonceReservationFailed,
  markNonceReservationSubmitted,
  releaseNonceReservation,
} from '@/services/nonce-reservation.service'
import { updateTransferStatus } from '@/services/transfer-log.service'
import { getWalletByChainAddress, recordChainTransaction } from '@/services/wallet.service'
import { getErrorMessage } from '@/lib/security/errors'
import { logError, logInfo, logWarn } from '@/lib/security/logging'
import { observeWalletChainRpcIssue } from '@/services/wallet-chain-observability.service'

type WalletSigningIntentWorkerConfig = {
  intervalMs: number
  batchSize: number
}

type WalletSigningIntentWorkerPassResult = {
  processedCount: number
  succeededCount: number
  failedCount: number
}

const DEFAULT_INTERVAL_MS = 1_000
const DEFAULT_BATCH_SIZE = 10

function parsePositiveInteger(rawValue: string | undefined, fallback: number, fieldName: string): number {
  if (!rawValue?.trim()) return fallback

  const parsed = Number(rawValue)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} must be a positive integer`)
  }

  return parsed
}

function readWorkerConfig(): WalletSigningIntentWorkerConfig {
  return {
    intervalMs: parsePositiveInteger(
      process.env.SIGNING_INTENT_WORKER_INTERVAL_MS,
      DEFAULT_INTERVAL_MS,
      'SIGNING_INTENT_WORKER_INTERVAL_MS',
    ),
    batchSize: parsePositiveInteger(
      process.env.SIGNING_INTENT_WORKER_BATCH_SIZE,
      DEFAULT_BATCH_SIZE,
      'SIGNING_INTENT_WORKER_BATCH_SIZE',
    ),
  }
}

function stringifyTxValue(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null
  const normalized = String(value).trim()
  return normalized ? normalized : null
}

async function markTransferSubmitted(
  payload: EvmTransactionSigningIntentPayload,
  txHash: string,
  replacesTxHash?: string | null,
) {
  if (!payload.transferLogId) return

  await updateTransferStatus(payload.transferLogId, 'submitted', {
    txHash,
    nonce: stringifyTxValue(payload.transaction.nonce ?? null),
    txType: payload.txType,
    data: payload.data ?? null,
    gasLimit: payload.transaction.gasLimit ?? null,
    gasPrice: payload.transaction.gasPrice ?? null,
    maxFeePerGas: payload.transaction.maxFeePerGas ?? null,
    maxPriorityFeePerGas: payload.transaction.maxPriorityFeePerGas ?? null,
    replacesTxHash: replacesTxHash ?? undefined,
  })
}

async function markTransferFailed(
  payload: EvmTransactionSigningIntentPayload | null,
  txHash?: string | null,
) {
  if (!payload?.transferLogId) return

  await updateTransferStatus(payload.transferLogId, 'failed', {
    txHash: txHash ?? undefined,
    nonce: stringifyTxValue(payload.transaction.nonce ?? null),
    txType: payload.txType,
    data: payload.data ?? null,
    gasLimit: payload.transaction.gasLimit ?? null,
    gasPrice: payload.transaction.gasPrice ?? null,
    maxFeePerGas: payload.transaction.maxFeePerGas ?? null,
    maxPriorityFeePerGas: payload.transaction.maxPriorityFeePerGas ?? null,
  })
}

async function processClaimedSigningIntent(
  payload: EvmTransactionSigningIntentPayload,
  intentId: string,
  traceId: string,
  provider: JsonRpcProvider,
) {
  let broadcastAttempted = false

  try {
    const signedPayload = await signUnsignedEvmTx(
      payload.walletId,
      payload.chainId,
      payload.transaction as unknown as TransactionRequest,
    )
    const derivedHash = deriveSignedEvmTxHash(signedPayload) ?? null

    await markWalletSigningIntentSigned(intentId, {
      signedPayload,
      txHash: derivedHash,
    })

    broadcastAttempted = true
    const broadcastTxHash = await submitSignedEvmTx(provider, signedPayload)
    const txHash = broadcastTxHash || derivedHash
    if (!txHash) {
      throw new Error('Unable to determine submitted transaction hash')
    }

    if (payload.nonceReservationId) {
      await markNonceReservationSubmitted(payload.nonceReservationId, txHash)
    }

    await markWalletSigningIntentSubmitted(intentId, {
      signedPayload,
      txHash,
    })
    await markTransferSubmitted(payload, txHash)

    const recipient = await getWalletByChainAddress({
      address: payload.toAddress,
      chainType: 'EVM',
      networkId: String(payload.chainId),
    }).catch(() => null)

    try {
      const chainRecord = await recordChainTransaction({
        chainId: payload.chainId,
        txHash,
        fromWalletId: payload.walletId,
        fromAddress: payload.fromAddress,
        toWalletId: recipient?.id ?? null,
        toAddress: payload.toAddress,
        valueBaseUnits: BigInt(payload.amountWei),
        asset: 'native',
        status: 'submitted',
        txType: payload.txType,
        nonce: payload.transaction.nonce ?? null,
        gasLimit: payload.transaction.gasLimit ?? null,
        gasPrice: payload.transaction.gasPrice ?? null,
        maxFeePerGas: payload.transaction.maxFeePerGas ?? null,
        maxPriorityFeePerGas: payload.transaction.maxPriorityFeePerGas ?? null,
        data: payload.data ?? payload.transaction.data ?? null,
      })

      if (chainRecord.replacedTxHashes[0]) {
        await markTransferSubmitted(payload, txHash, chainRecord.replacedTxHashes[0])
      }
      await markReplacedTransferAttempts(chainRecord.replacedTxHashes, txHash)
    } catch (error) {
      logError('wallet-signing-intent-worker:chain-transaction', error, {
        intentId,
        traceId,
        walletId: payload.walletId,
        chainId: payload.chainId,
        txHash,
      })
    }

    return { txHash }
  } catch (error) {
    if (payload.nonceReservationId) {
      if (broadcastAttempted) {
        await markNonceReservationFailed(payload.nonceReservationId).catch(() => {})
      } else {
        await releaseNonceReservation(payload.nonceReservationId).catch(() => {})
      }
    }
    throw error
  }
}

export async function processWalletSigningIntentQueuePass(
  input?: Partial<WalletSigningIntentWorkerConfig>,
): Promise<WalletSigningIntentWorkerPassResult> {
  const config = {
    ...readWorkerConfig(),
    ...(input ?? {}),
  }

  let processedCount = 0
  let succeededCount = 0
  let failedCount = 0

  for (let index = 0; index < config.batchSize; index += 1) {
    const intent = await claimNextQueuedWalletSigningIntent()
    if (!intent) break

    processedCount += 1
    let payload: EvmTransactionSigningIntentPayload | null = null
    let txHash: string | null = intent.txHash

    try {
      payload = intent.payload
      let provider
      try {
        provider = await getEvmProviderForChain(payload.chainId)
      } catch (error) {
        await observeWalletChainRpcIssue({
          scope: 'wallet-signing-intent-worker',
          traceId: intent.traceId,
          correlationId: intent.traceId,
          walletId: payload.walletId,
          chainId: payload.chainId,
          error,
          details: {
            intentId: intent.id,
          },
        })
        throw error
      }
      const result = await processClaimedSigningIntent(payload, intent.id, intent.traceId, provider)
      txHash = result.txHash
      succeededCount += 1
      logInfo('wallet-signing-intent-worker:pass', 'Processed signing intent', {
        intentId: intent.id,
        traceId: intent.traceId,
        walletId: payload.walletId,
        chainId: payload.chainId,
        txHash,
      })
    } catch (error) {
      failedCount += 1
      const errorCode = getErrorMessage(error, 'SIGNING_INTENT_FAILED')
      await markWalletSigningIntentFailed(intent.id, {
        errorCode,
        errorDetails: {
          walletId: payload?.walletId ?? intent.walletId,
          chainId: payload?.chainId ?? intent.chainId,
        },
        txHash,
      }).catch(() => {})
      await markTransferFailed(payload, txHash).catch(() => {})
      logError('wallet-signing-intent-worker:pass', error, {
        intentId: intent.id,
        traceId: intent.traceId,
        walletId: payload?.walletId ?? intent.walletId,
        chainId: payload?.chainId ?? intent.chainId,
      })
    }
  }

  return {
    processedCount,
    succeededCount,
    failedCount,
  }
}

export function startWalletSigningIntentWorker(input?: Partial<WalletSigningIntentWorkerConfig>) {
  const config = {
    ...readWorkerConfig(),
    ...(input ?? {}),
  }
  let inFlight = false

  const runPass = async (trigger: 'startup' | 'interval') => {
    if (inFlight) {
      logWarn('wallet-signing-intent-worker', new Error('Skipped overlapping signing pass'), { trigger })
      return
    }

    inFlight = true
    try {
      const result = await processWalletSigningIntentQueuePass(config)
      logInfo('wallet-signing-intent-worker', 'Completed wallet signing intent pass', {
        trigger,
        intervalMs: config.intervalMs,
        batchSize: config.batchSize,
        processedCount: result.processedCount,
        succeededCount: result.succeededCount,
        failedCount: result.failedCount,
      })
    } catch (error) {
      logError('wallet-signing-intent-worker', error, {
        trigger,
        intervalMs: config.intervalMs,
        batchSize: config.batchSize,
      })
    } finally {
      inFlight = false
    }
  }

  logInfo('wallet-signing-intent-worker', 'Starting wallet signing intent worker', config)
  void runPass('startup')

  const timer = setInterval(() => {
    void runPass('interval')
  }, config.intervalMs)

  return {
    stop() {
      clearInterval(timer)
      logInfo('wallet-signing-intent-worker', 'Stopped wallet signing intent worker', config)
    },
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startWalletSigningIntentWorker()
}
