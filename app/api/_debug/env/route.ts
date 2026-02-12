// app/api/_debug/env/route.ts
import { NextResponse } from 'next/server'
import { hasValidInternalToken } from '@/lib/security/internal-token'
import { isStrictMode } from '@/lib/security/runtime'

export async function GET(req: Request) {
  const expected = process.env.INTERNAL_API_TOKEN?.trim()
  if (isStrictMode && !expected) {
    return NextResponse.json({ error: 'DISABLED' }, { status: 404 })
  }

  if (expected && !hasValidInternalToken(req, expected)) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  }

  return NextResponse.json({
    PG_DATABASE_URL: Boolean(process.env.PG_DATABASE_URL ?? process.env.POSTGRES_URL),
    CRDB_DATABASE_URL: Boolean(process.env.CRDB_DATABASE_URL ?? process.env.COCKROACH_URL),
    NODE_ENV: process.env.NODE_ENV ?? null,
  })
}
