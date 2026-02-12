export type ErrorLike = { message: string }

export function isErrorLike(error: unknown): error is ErrorLike {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
  )
}

export function getErrorMessage(error: unknown, fallback = 'Unexpected error'): string {
  return isErrorLike(error) ? error.message : fallback
}

export function getErrorCode(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code
    return typeof code === 'string' ? code : null
  }
  return null
}

export function asError(error: unknown): Error {
  if (error instanceof Error) return error
  if (isErrorLike(error)) return new Error(error.message)
  return new Error(String(error))
}
