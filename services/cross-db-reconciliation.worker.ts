import { pathToFileURL } from 'node:url'
import { logError, logInfo, logWarn } from '@/lib/security/logging'
import {
  readCrossDbReconciliationConfig,
  reconcileCrossDbState,
  type CrossDbReconciliationConfig,
} from '@/services/cross-db-reconciliation.service'

type CrossDbReconciliationWorkerConfig = CrossDbReconciliationConfig & {
  intervalMs: number
}

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000

function parsePositiveInteger(rawValue: string | undefined, fallback: number, fieldName: string): number {
  if (!rawValue?.trim()) return fallback

  const parsed = Number(rawValue)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} must be a positive integer`)
  }

  return parsed
}

function readWorkerConfig(): CrossDbReconciliationWorkerConfig {
  return {
    ...readCrossDbReconciliationConfig(),
    intervalMs: parsePositiveInteger(
      process.env.CROSS_DB_RECONCILIATION_INTERVAL_MS,
      DEFAULT_INTERVAL_MS,
      'CROSS_DB_RECONCILIATION_INTERVAL_MS',
    ),
  }
}

export function startCrossDbReconciliationWorker(input?: Partial<CrossDbReconciliationWorkerConfig>) {
  const config = {
    ...readWorkerConfig(),
    ...(input ?? {}),
  }
  let inFlight = false

  const runPass = async (trigger: 'startup' | 'interval') => {
    if (inFlight) {
      logWarn('cross-db-reconciliation-worker', new Error('Skipped overlapping reconciliation pass'), { trigger })
      return
    }

    inFlight = true
    try {
      const result = await reconcileCrossDbState(config)
      logInfo('cross-db-reconciliation-worker', 'Completed cross-DB reconciliation pass', {
        trigger,
        skipped: result.skipped,
        transferChecked: result.transfer.checkedCount,
        transferMissing: result.transfer.missingCount,
        transferMismatch: result.transfer.mismatchCount,
        xrplChecked: result.xrpl.checkedCount,
        xrplMissing: result.xrpl.missingCount,
        xrplMismatch: result.xrpl.mismatchCount,
        riskChecked: result.risk.checkedCount,
        riskMissing: result.risk.missingCount,
        riskMismatch: result.risk.mismatchCount,
        openedCount: result.openedCount,
        resolvedCount: result.resolvedCount,
      })
    } catch (error) {
      logError('cross-db-reconciliation-worker:pass', error, { trigger })
    } finally {
      inFlight = false
    }
  }

  logInfo('cross-db-reconciliation-worker', 'Starting cross-DB reconciliation worker', config)
  void runPass('startup')

  const timer = setInterval(() => {
    void runPass('interval')
  }, config.intervalMs)

  return {
    stop() {
      clearInterval(timer)
      logInfo('cross-db-reconciliation-worker', 'Stopped cross-DB reconciliation worker', config)
    },
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startCrossDbReconciliationWorker()
}
