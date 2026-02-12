// app/api/_debug/env/route.ts
import { NextResponse } from 'next/server'
import { hasValidInternalToken } from '@/lib/security/internal-token'
import { isStrictMode } from '@/lib/security/runtime'
import { errorJson } from '@/lib/security/api-response'

export async function GET(req: Request) {
  const expected = process.env.INTERNAL_API_TOKEN?.trim()
  if (isStrictMode && !expected) {
    return errorJson(404, 'disabled', 'DISABLED')
  }

  if (expected && !hasValidInternalToken(req, expected)) {
    return errorJson(401, 'unauthorized', 'UNAUTHORIZED')
  }

  return NextResponse.json({
    PG_DATABASE_URL: Boolean(process.env.PG_DATABASE_URL ?? process.env.POSTGRES_URL),
    CRDB_DATABASE_URL: Boolean(process.env.CRDB_DATABASE_URL ?? process.env.COCKROACH_URL),
    NODE_ENV: process.env.NODE_ENV ?? null,
  })
}
