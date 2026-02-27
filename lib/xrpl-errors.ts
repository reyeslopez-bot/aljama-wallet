import { getErrorCode, getErrorMessage } from '@/lib/security/errors'

function getXrplDataError(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('data' in error)) {
    return null
  }

  const data = (error as { data?: unknown }).data
  if (typeof data !== 'object' || data === null || !('error' in data)) {
    return null
  }

  const value = (data as { error?: unknown }).error
  return typeof value === 'string' ? value : null
}

export function isXrplAccountNotFoundError(error: unknown): boolean {
  const message = getErrorMessage(error, '').toLowerCase()
  const code = getErrorCode(error)?.toLowerCase() ?? ''
  const dataError = getXrplDataError(error)?.toLowerCase() ?? ''

  return (
    code === 'actnotfound' ||
    dataError === 'actnotfound' ||
    message.includes('actnotfound') ||
    message.includes('account not found')
  )
}
