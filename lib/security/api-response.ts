import { NextResponse } from 'next/server'

export type ApiErrorPayload = {
  ok: false
  error: string
  code: string
  details?: unknown
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
  return NextResponse.json(payload, { status, ...init })
}

export function okJson<T extends Record<string, unknown>>(payload: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, ...payload }, init)
}
