import { pathToFileURL } from 'node:url'
import { logError, logInfo, logWarn } from '@/lib/security/logging'
import { drainSecurityAlertDeliveryQueue } from '@/services/security-alert.service'

type SecurityAlertDeliveryWorkerConfig = {
  intervalMs: number
}

const DEFAULT_INTERVAL_MS = 1_000

function parsePositiveInteger(rawValue: string | undefined, fallback: number, fieldName: string): number {
  if (!rawValue?.trim()) return fallback

  const parsed = Number(rawValue)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} must be a positive integer`)
  }

  return parsed
}

function readWorkerConfig(): SecurityAlertDeliveryWorkerConfig {
  return {
    intervalMs: parsePositiveInteger(
      process.env.SECURITY_ALERT_DELIVERY_WORKER_INTERVAL_MS,
      DEFAULT_INTERVAL_MS,
      'SECURITY_ALERT_DELIVERY_WORKER_INTERVAL_MS',
    ),
  }
}

export function startSecurityAlertDeliveryWorker(input?: Partial<SecurityAlertDeliveryWorkerConfig>) {
  const config = {
    ...readWorkerConfig(),
    ...(input ?? {}),
  }
  let inFlight = false

  const runPass = async (trigger: 'startup' | 'interval') => {
    if (inFlight) {
      logWarn('security-alert:delivery-worker', new Error('Skipped overlapping alert delivery pass'), { trigger })
      return
    }

    inFlight = true
    try {
      const processed = await drainSecurityAlertDeliveryQueue()
      logInfo('security-alert:delivery-worker', 'Completed security alert delivery pass', {
        trigger,
        processedCount: processed.size,
      })
    } catch (error) {
      logError('security-alert:delivery-worker', error, { trigger })
    } finally {
      inFlight = false
    }
  }

  logInfo('security-alert:delivery-worker', 'Starting security alert delivery worker', config)
  void runPass('startup')

  const timer = setInterval(() => {
    void runPass('interval')
  }, config.intervalMs)

  return {
    stop() {
      clearInterval(timer)
      logInfo('security-alert:delivery-worker', 'Stopped security alert delivery worker', config)
    },
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startSecurityAlertDeliveryWorker()
}
