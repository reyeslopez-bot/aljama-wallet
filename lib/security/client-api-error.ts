type ClientApiErrorBody = {
  error?: unknown
  code?: unknown
  details?: unknown
  message?: unknown
}

type ResponseLike = {
  status: number
  headers?: Pick<Headers, 'get'> | null
}

export type ClientApiErrorDetails = {
  status: number
  code: string | null
  rawMessage: string | null
  retryAfterSeconds: number | null
  message: string
}

function normalizeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function normalizeErrorMessage(value: unknown): string | null {
  if (typeof value === 'string') {
    return normalizeString(value)
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return normalizeString((value as { message?: unknown }).message)
  }

  return null
}

function normalizeCode(value: string | null): string | null {
  if (!value) return null
  return value.trim().toLowerCase()
}

function readRetryAfterSeconds(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value)
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed)
    }
  }
  return null
}

function readRetryAfterFromDetails(details: unknown): number | null {
  if (!details || typeof details !== 'object' || Array.isArray(details)) {
    return null
  }

  return readRetryAfterSeconds((details as { retryAfter?: unknown }).retryAfter)
}

function inferCodeFromMessage(message: string | null): string | null {
  if (!message || !/^[A-Z0-9_]+$/.test(message)) {
    return null
  }

  return normalizeCode(message)
}

function formatRetryWindow(seconds: number | null): string {
  if (!seconds) return 'Try again soon.'
  return `Try again in ${seconds} second${seconds === 1 ? '' : 's'}.`
}

function buildKnownErrorMessage(code: string | null, retryAfterSeconds: number | null): string | null {
  switch (code) {
    case 'rate_limited':
      return `Too many attempts. ${formatRetryWindow(retryAfterSeconds)}`
    case 'rate_limit_backend_unavailable':
      return `Request temporarily unavailable. ${formatRetryWindow(retryAfterSeconds)}`
    default:
      return null
  }
}

export function parseClientApiError(response: ResponseLike, body: unknown): ClientApiErrorDetails {
  const status = typeof response.status === 'number' && Number.isFinite(response.status) ? response.status : 0
  const record =
    body && typeof body === 'object' && !Array.isArray(body)
      ? (body as ClientApiErrorBody)
      : null

  const rawMessage = normalizeErrorMessage(record?.error) ?? normalizeString(record?.message)
  const code = normalizeCode(normalizeString(record?.code) ?? inferCodeFromMessage(rawMessage))
  const retryAfterSeconds =
    readRetryAfterSeconds(response.headers?.get('retry-after')) ??
    readRetryAfterFromDetails(record?.details)
  const knownMessage = buildKnownErrorMessage(code, retryAfterSeconds)

  return {
    status,
    code,
    rawMessage,
    retryAfterSeconds,
    message: knownMessage ?? rawMessage ?? code ?? `Request failed (${status || 'unknown'})`,
  }
}
