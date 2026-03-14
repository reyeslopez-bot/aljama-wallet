// app/api/_debug/env/route.ts
import { NextResponse } from 'next/server'
import { hasValidInternalToken } from '@/lib/security/internal-token'
import { canBypassDebugRouteTokenCheck, debugRouteDisabledResponse } from '@/lib/security/debug-route'
import { isStrictMode } from '@/lib/security/runtime'
import { errorJson } from '@/lib/security/api-response'
import { withApiRoute } from '@/lib/security/api-route'
import { recordSecuritySignal } from '@/services/security-anomaly.service'
import { extractRequestSignalContext } from '@/lib/security/request-signal'
import { logError } from '@/lib/security/logging'

async function getDebugEnv(req: Request) {
  const signalContext = extractRequestSignalContext(req)
  const trackSignal = async (input: {
    outcome: 'success' | 'failure' | 'blocked'
    statusCode: number
    details?: Record<string, unknown>
  }) => {
    try {
      await recordSecuritySignal({
        source: 'internal.debug-env',
        route: '/api/_debug/env',
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
      logError('debug-env:signal', error)
    }
  }

  const disabledResponse = debugRouteDisabledResponse()
  if (disabledResponse) {
    await trackSignal({
      outcome: 'blocked',
      statusCode: 404,
      details: { reason: 'hard_disabled' },
    })
    return disabledResponse
  }

  const canBypassTokenCheck = canBypassDebugRouteTokenCheck(req)

  const expected = process.env.INTERNAL_API_TOKEN?.trim()
  if ((isStrictMode || !canBypassTokenCheck) && !expected) {
    await trackSignal({
      outcome: 'blocked',
      statusCode: 404,
      details: { reason: 'disabled', missingInternalToken: true },
    })
    return errorJson(404, 'disabled', 'DISABLED')
  }

  if (expected && !hasValidInternalToken(req, expected)) {
    await trackSignal({
      outcome: 'failure',
      statusCode: 401,
      details: { reason: 'unauthorized' },
    })
    return errorJson(401, 'unauthorized', 'UNAUTHORIZED')
  }

  await trackSignal({
    outcome: 'success',
    statusCode: 200,
    details: { reason: 'ok' },
  })
  return NextResponse.json({
    PG_DATABASE_URL: Boolean(process.env.PG_DATABASE_URL ?? process.env.POSTGRES_URL),
    CRDB_DATABASE_URL: Boolean(process.env.CRDB_DATABASE_URL ?? process.env.COCKROACH_URL),
    NODE_ENV: process.env.NODE_ENV ?? null,
  })
}

export const GET = withApiRoute({ scope: 'api:debug-env', timeoutMs: 5_000 }, getDebugEnv)
