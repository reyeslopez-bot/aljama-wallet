import { getErrorMessage } from './errors'

export function logError(scope: string, error: unknown, details?: Record<string, unknown>) {
  const message = getErrorMessage(error, 'Unknown error')
  if (details) {
    console.error(`[${scope}] ${message}`, { ...details, error })
    return
  }
  console.error(`[${scope}] ${message}`, error)
}

export function logWarn(scope: string, error: unknown, details?: Record<string, unknown>) {
  const message = getErrorMessage(error, 'Unknown warning')
  if (details) {
    console.warn(`[${scope}] ${message}`, { ...details, error })
    return
  }
  console.warn(`[${scope}] ${message}`, error)
}

export function logInfo(scope: string, message: string, details?: Record<string, unknown>) {
  if (details) {
    console.info(`[${scope}] ${message}`, details)
    return
  }
  console.info(`[${scope}] ${message}`)
}
