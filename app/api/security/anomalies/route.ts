import { errorJson, okJson } from '@/lib/security/api-response'
import { hasValidInternalToken } from '@/lib/security/internal-token'
import { buildRateLimitKey, getRateLimitBackendHealth, rateLimit } from '@/lib/security/rate-limit'
import { getSecurityAlerts } from '@/services/security-alert.service'
import {
  getRecentSecurityAnomalies,
  getRecentSecuritySignals,
  getSecuritySignalQueueState,
  listSecurityAnomalyRules,
  recordSecuritySignal,
} from '@/services/security-anomaly.service'
import { extractRequestSignalContext } from '@/lib/security/request-signal'
import { logError } from '@/lib/security/logging'

const DEFAULT_LIMIT = 100
const MAX_LIMIT = 500

function parseLimit(value: string | null): number {
  if (!value) return DEFAULT_LIMIT
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) return DEFAULT_LIMIT
  return Math.min(parsed, MAX_LIMIT)
}

export async function GET(req: Request) {
  const signalContext = extractRequestSignalContext(req)
  const trackSignal = async (input: {
    outcome: 'success' | 'failure' | 'blocked'
    statusCode: number
    details?: Record<string, unknown>
  }) => {
    try {
      await recordSecuritySignal({
        source: 'internal.security-anomalies',
        route: '/api/security/anomalies',
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
      logError('security-anomalies:signal', error)
    }
  }

  const expected =
    process.env.SECURITY_ALERTS_API_TOKEN?.trim() ?? process.env.INTERNAL_API_TOKEN?.trim() ?? ''
  if (!expected) {
    await trackSignal({
      outcome: 'blocked',
      statusCode: 404,
      details: { reason: 'disabled', missingToken: true },
    })
    return errorJson(404, 'disabled', 'DISABLED')
  }

  if (!hasValidInternalToken(req, expected)) {
    await trackSignal({
      outcome: 'failure',
      statusCode: 401,
      details: { reason: 'unauthorized' },
    })
    return errorJson(401, 'unauthorized', 'UNAUTHORIZED')
  }

  const rateKey = buildRateLimitKey(req, null)
  const limitState = await rateLimit({
    bucket: 'security-anomalies',
    key: rateKey,
    limit: 30,
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

  const { searchParams } = new URL(req.url)
  const signalsLimit = parseLimit(searchParams.get('signals'))
  const anomaliesLimit = parseLimit(searchParams.get('anomalies'))
  const alertsLimit = parseLimit(searchParams.get('alerts'))

  await trackSignal({
    outcome: 'success',
    statusCode: 200,
    details: {
      signalsLimit,
      anomaliesLimit,
      alertsLimit,
    },
  })

  return okJson({
    generatedAt: new Date().toISOString(),
    signals: getRecentSecuritySignals(signalsLimit),
    anomalies: getRecentSecurityAnomalies(anomaliesLimit),
    alerts: getSecurityAlerts(alertsLimit),
    queue: await getSecuritySignalQueueState(),
    rateLimit: getRateLimitBackendHealth(),
    rules: listSecurityAnomalyRules(),
  })
}
