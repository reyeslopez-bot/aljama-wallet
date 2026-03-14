export const REQUEST_ID_HEADER = 'x-request-id'
export const CORRELATION_ID_HEADER = 'x-correlation-id'
export const TRACE_ID_HEADER = 'x-trace-id'

const MAX_ID_LENGTH = 128

function normalizeProvidedId(value: string | null): string | null {
  const trimmed = value?.trim()
  if (!trimmed || trimmed.length > MAX_ID_LENGTH) return null
  return trimmed
}

export function resolveProvidedRequestId(headers: Headers): string | null {
  return normalizeProvidedId(headers.get(REQUEST_ID_HEADER))
}

export function resolveProvidedTraceId(headers: Headers): string | null {
  return normalizeProvidedId(headers.get(TRACE_ID_HEADER)) ?? normalizeProvidedId(headers.get(CORRELATION_ID_HEADER))
}

export function createTraceId(prefix = 'trace'): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID()
  }

  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

export function buildTraceHeaders(traceId: string): Record<string, string> {
  return {
    [TRACE_ID_HEADER]: traceId,
    [CORRELATION_ID_HEADER]: traceId,
  }
}
