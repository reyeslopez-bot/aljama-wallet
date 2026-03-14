// app/api/test-db/route.ts
import { NextResponse } from 'next/server'
import { getWallets } from '@/services/wallet.service'
import { getDailySummaries } from '@/infra/utils/summary.service'
import { canBypassDebugRouteTokenCheck, debugRouteDisabledResponse } from '@/lib/security/debug-route'
import { hasValidInternalToken } from '@/lib/security/internal-token'
import { isStrictMode } from '@/lib/security/runtime'
import { buildRateLimitKey, rateLimit } from '@/lib/security/rate-limit'
import { errorJson } from '@/lib/security/api-response'
import { withApiRoute } from '@/lib/security/api-route'
import { logError } from '@/lib/security/logging'
import { getErrorMessage } from '@/lib/security/errors'
import { recordSecuritySignal } from '@/services/security-anomaly.service'
import { extractRequestSignalContext } from '@/lib/security/request-signal'

export const dynamic = 'force-dynamic'

async function getTestDb(req?: Request) {
  const request = req ?? new Request('http://localhost')
  const signalContext = extractRequestSignalContext(request)
  const trackSignal = async (input: {
    outcome: 'success' | 'failure' | 'blocked'
    statusCode: number
    details?: Record<string, unknown>
  }) => {
    try {
      await recordSecuritySignal({
        source: 'internal.test-db',
        route: '/api/test-db',
        outcome: input.outcome,
        statusCode: input.statusCode,
        ipHash: signalContext.ipHash,
        country: signalContext.country,
        latitude: signalContext.latitude,
        longitude: signalContext.longitude,
        userAgent: signalContext.userAgent,
        details: input.details,
      })
    } catch (error) {
      logError('test-db:signal', error)
    }
  }

  const disabledResponse = debugRouteDisabledResponse({ allowInCiEnvVar: 'ENABLE_TEST_DB_ROUTE' })
  if (disabledResponse) {
    await trackSignal({
      outcome: 'blocked',
      statusCode: 404,
      details: { reason: 'hard_disabled' },
    })
    return disabledResponse
  }

  const canBypassTokenCheck = canBypassDebugRouteTokenCheck(request)

  const expected = process.env.INTERNAL_API_TOKEN?.trim()
  if ((isStrictMode || !canBypassTokenCheck) && !expected) {
    await trackSignal({
      outcome: 'blocked',
      statusCode: 404,
      details: { reason: 'disabled', missingInternalToken: true },
    })
    return errorJson(404, 'disabled', 'DISABLED')
  }
  if (expected && !hasValidInternalToken(request, expected)) {
    await trackSignal({
      outcome: 'failure',
      statusCode: 401,
      details: { reason: 'unauthorized' },
    })
    return errorJson(401, 'unauthorized', 'UNAUTHORIZED')
  }

  const rateKey = buildRateLimitKey(request, null)
  const limitState = await rateLimit({
    bucket: 'test-db',
    key: rateKey,
    limit: 10,
    windowMs: 60_000,
  })
  if (!limitState.ok) {
    await trackSignal({
      outcome: 'blocked',
      statusCode: 429,
      details: { reason: 'rate_limited', retryAfter: limitState.retryAfter },
    })
    return errorJson(
      429,
      'rate_limited',
      'RATE_LIMITED',
      { retryAfter: limitState.retryAfter },
      { headers: { 'retry-after': String(limitState.retryAfter) } },
    )
  }

  try {
    const [wallets, summaries] = await Promise.all([getWallets(), getDailySummaries()])
    await trackSignal({
      outcome: 'success',
      statusCode: 200,
      details: { walletCount: wallets.length, summaryCount: summaries.length },
    })
    return NextResponse.json({ wallets, summaries }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    logError('test-db', error)
    await trackSignal({
      outcome: 'failure',
      statusCode: 500,
      details: { reason: 'test_db_failed' },
    })
    const message = getErrorMessage(error, 'Failed to fetch test data')
    return errorJson(500, 'test_db_failed', message)
  }
}

export const GET = withApiRoute({ scope: 'api:test-db', timeoutMs: 10_000 }, getTestDb)
