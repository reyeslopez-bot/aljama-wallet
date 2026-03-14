import { pathToFileURL } from 'node:url'
import { logError, logInfo, logWarn } from '@/lib/security/logging'
import {
  collectChainTransactionSyncMetrics,
  observeChainTransactionSyncPass,
} from '@/services/chain-transaction-monitor.service'
import { syncRecentEvmChainTransactions } from '@/services/chain-transaction-sync.service'

type ChainTransactionSyncWorkerConfig = {
  intervalMs: number
  limit: number
  networkId: string | null
}

const DEFAULT_INTERVAL_MS = 15_000
const DEFAULT_LIMIT = 50

function parsePositiveInteger(
  rawValue: string | undefined,
  fallback: number,
  fieldName: string,
): number {
  if (!rawValue?.trim()) return fallback

  const parsed = Number(rawValue)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} must be a positive integer`)
  }

  return parsed
}

function readWorkerConfig(): ChainTransactionSyncWorkerConfig {
  return {
    intervalMs: parsePositiveInteger(
      process.env.CHAIN_TRANSACTION_SYNC_INTERVAL_MS,
      DEFAULT_INTERVAL_MS,
      'CHAIN_TRANSACTION_SYNC_INTERVAL_MS',
    ),
    limit: parsePositiveInteger(
      process.env.CHAIN_TRANSACTION_SYNC_LIMIT,
      DEFAULT_LIMIT,
      'CHAIN_TRANSACTION_SYNC_LIMIT',
    ),
    networkId: process.env.CHAIN_TRANSACTION_SYNC_NETWORK_ID?.trim() || null,
  }
}

export function startChainTransactionSyncWorker(input?: Partial<ChainTransactionSyncWorkerConfig>) {
  const config = {
    ...readWorkerConfig(),
    ...(input ?? {}),
  }
  let inFlight = false

  const runPass = async (trigger: 'startup' | 'interval') => {
    if (inFlight) {
      logWarn('chain-tx-sync-worker', new Error('Skipped overlapping sync pass'), { trigger })
      return
    }

    inFlight = true
    try {
      const result = await syncRecentEvmChainTransactions({
        networkId: config.networkId,
        limit: config.limit,
      })
      const metrics = await collectChainTransactionSyncMetrics({
        trigger,
        networkId: config.networkId,
        processedCount: result.processedCount,
        succeededCount: result.succeededCount,
        failedCount: result.failedCount,
      })
      await observeChainTransactionSyncPass(metrics)
      logInfo('chain-tx-sync-worker', 'Completed EVM chain transaction sync pass', {
        trigger,
        networkId: config.networkId,
        limit: config.limit,
        processedCount: metrics.processedCount,
        succeededCount: metrics.succeededCount,
        failedCount: metrics.failedCount,
        stuckSubmitted: metrics.stuckSubmitted.count,
        stuckIncluded: metrics.stuckIncluded.count,
      })
    } catch (error) {
      logError('chain-tx-sync-worker:pass', error, {
        trigger,
        networkId: config.networkId,
        limit: config.limit,
      })
    } finally {
      inFlight = false
    }
  }

  logInfo('chain-tx-sync-worker', 'Starting EVM chain transaction sync worker', config)
  void runPass('startup')

  const timer = setInterval(() => {
    void runPass('interval')
  }, config.intervalMs)

  return {
    stop() {
      clearInterval(timer)
      logInfo('chain-tx-sync-worker', 'Stopped EVM chain transaction sync worker', config)
    },
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startChainTransactionSyncWorker()
}
