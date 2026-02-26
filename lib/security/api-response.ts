import { NextResponse } from 'next/server'

export type ApiErrorPayload = {
  ok: false
  error: string
  code: string
  details?: unknown
}

const DEFAULT_API_SECURITY_HEADERS = new Map<string, string>([
  ['cache-control', 'no-store, max-age=0'],
  ['pragma', 'no-cache'],
  ['expires', '0'],
  ['x-content-type-options', 'nosniff'],
  ['x-frame-options', 'DENY'],
  ['referrer-policy', 'no-referrer'],
  ['cross-origin-resource-policy', 'same-origin'],
  ['permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()'],
])

function withApiSecurityHeaders(init?: ResponseInit): Headers {
  const headers = new Headers(init?.headers)
  for (const [key, value] of DEFAULT_API_SECURITY_HEADERS) {
    if (!headers.has(key)) {
      headers.set(key, value)
    }
  }
  return headers
}

export function errorJson(
  status: number,
  code: string,
  message: string,
  details?: unknown,
  init?: ResponseInit,
) {
  const payload: ApiErrorPayload = {
    ok: false,
    error: message,
    code,
    ...(details === undefined ? {} : { details }),
  }
  return NextResponse.json(payload, { ...init, status, headers: withApiSecurityHeaders(init) })
}

export function okJson<T extends Record<string, unknown>>(payload: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, ...payload }, { ...init, headers: withApiSecurityHeaders(init) })
}
