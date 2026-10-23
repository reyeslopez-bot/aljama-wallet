import { pathToFileURL } from 'node:url'
import { logError, logInfo, logWarn } from '@/lib/security/logging'
import {
  purgeExpiredConsentReceipts,
  purgeResolvedPrivacyRequests,
} from '@/services/privacy-request-retention.service'

const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000

function readIntervalMs() {
  const raw = process.env.PRIVACY_REQUEST_RETENTION_INTERVAL_MS
  if (!raw?.trim()) return DEFAULT_INTERVAL_MS
  const value = Number(raw)
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error('PRIVACY_REQUEST_RETENTION_INTERVAL_MS must be a positive integer')
  }
  return value
}

export function startPrivacyRequestRetentionWorker(intervalMs = readIntervalMs()) {
  if (!process.env.PG_DATABASE_URL && !process.env.POSTGRES_URL) {
    throw new Error('PostgreSQL must be configured to start privacy request retention')
  }
  if (!Number.isInteger(intervalMs) || intervalMs <= 0) {
    throw new Error('Privacy request retention interval must be a positive integer')
  }

  let inFlight = false
  const runPass = async (trigger: 'startup' | 'interval') => {
    if (inFlight) {
      logWarn('privacy-request-retention-worker', new Error('Skipped overlapping cleanup pass'), { trigger })
      return
    }

    inFlight = true
    try {
      const [deletedRequests, deletedConsentReceipts] = await Promise.all([
        purgeResolvedPrivacyRequests(),
        purgeExpiredConsentReceipts(),
      ])
      logInfo('privacy-request-retention-worker', 'Completed privacy request retention pass', {
        trigger,
        deletedRequests,
        deletedConsentReceipts,
      })
    } catch (error) {
      logError('privacy-request-retention-worker:pass', error, { trigger })
    } finally {
      inFlight = false
    }
  }

  logInfo('privacy-request-retention-worker', 'Starting privacy request retention worker', { intervalMs })
  void runPass('startup')
  const timer = setInterval(() => void runPass('interval'), intervalMs)

  return {
    stop() {
      clearInterval(timer)
      logInfo('privacy-request-retention-worker', 'Stopped privacy request retention worker', { intervalMs })
    },
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startPrivacyRequestRetentionWorker()
}
