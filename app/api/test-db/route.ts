// app/api/test-db/route.ts
import { NextResponse } from 'next/server'
import { getWallets } from '@/services/wallet.service'
import { getDailySummaries } from '@/infra/utils/summary.service'
import { hasValidInternalToken } from '@/lib/security/internal-token'
import { isStrictMode } from '@/lib/security/runtime'
import { buildRateLimitKey, rateLimit } from '@/lib/security/rate-limit'
import { errorJson } from '@/lib/security/api-response'
import { logError } from '@/lib/security/logging'
import { getErrorMessage } from '@/lib/security/errors'

export const dynamic = 'force-dynamic'

export async function GET(req?: Request) {
  const expected = process.env.INTERNAL_API_TOKEN?.trim()
  if (isStrictMode && !expected) {
    return errorJson(404, 'disabled', 'DISABLED')
  }
  if (expected && !hasValidInternalToken(req ?? new Request('http://localhost'), expected)) {
    return errorJson(401, 'unauthorized', 'UNAUTHORIZED')
  }

  const request = req ?? new Request('http://localhost')
  const rateKey = buildRateLimitKey(request, null)
  const limitState = rateLimit({
    bucket: 'test-db',
    key: rateKey,
    limit: 10,
    windowMs: 60_000,
  })
  if (!limitState.ok) {
    return errorJson(
      429,
      'rate_limited',
      'RATE_LIMITED',
      { retryAfter: limitState.retryAfter },
      { headers: { 'retry-after': String(limitState.retryAfter) } },
    )
  }

  if (
    process.env.NODE_ENV === 'production' ||
    (process.env.CI === 'true' && process.env.ENABLE_TEST_DB_ROUTE !== 'true')
  ) {
    return NextResponse.json({ ok: false, reason: 'disabled' }, { status: 404 })
  }

  try {
    const [wallets, summaries] = await Promise.all([getWallets(), getDailySummaries()])
    return NextResponse.json({ wallets, summaries }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    logError('test-db', error)
    const message = getErrorMessage(error, 'Failed to fetch test data')
    return errorJson(500, 'test_db_failed', message)
  }
}
