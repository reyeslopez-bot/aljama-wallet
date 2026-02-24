import { errorJson, okJson } from '@/lib/security/api-response'
import { hasValidInternalToken } from '@/lib/security/internal-token'
import { logError } from '@/lib/security/logging'
import { buildRateLimitKey, rateLimit } from '@/lib/security/rate-limit'
import { readJsonBody } from '@/lib/security/request-body'
import { extractRequestSignalContext } from '@/lib/security/request-signal'
import {
  ingestSecuritySignalsBatch,
  recordSecuritySignal,
  type SecuritySignalTransport,
} from '@/services/security-anomaly.service'

const MAX_BATCH_SIGNALS = 200

function normalizeTransport(value: unknown): SecuritySignalTransport {
  if (typeof value !== 'string') return 'api'
  const normalized = value.trim().toLowerCase()
  if (normalized === 'direct' || normalized === 'api' || normalized === 'queue' || normalized === 'event_bus') {
    return normalized
  }
  return 'api'
}

function collectSignals(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload

  if (typeof payload !== 'object' || payload === null) return []
  const body = payload as Record<string, unknown>

  if (Array.isArray(body.signals)) return body.signals
  if (body.signal !== undefined) return [body.signal]
  return [body]
}

export async function POST(req: Request) {
  const signalContext = extractRequestSignalContext(req)
  const trackSignal = async (input: {
    outcome: 'success' | 'failure' | 'blocked'
    statusCode: number
    details?: Record<string, unknown>
  }) => {
    try {
      await recordSecuritySignal({
        source: 'internal.security-signals',
        route: '/api/security/signals',
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
      logError('security-signals:track', error)
    }
  }

  const expected =
    process.env.SECURITY_SIGNAL_INGEST_TOKEN?.trim() ??
    process.env.SECURITY_ALERTS_API_TOKEN?.trim() ??
    process.env.INTERNAL_API_TOKEN?.trim() ??
    ''

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
  const limitState = rateLimit({
    bucket: 'security-signals',
    key: rateKey,
    limit: 60,
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

  const parsed = await readJsonBody<Record<string, unknown>>(req, {
    maxBytes: 128 * 1024,
    allowEmpty: false,
  })
  if (!parsed.ok) {
    await trackSignal({
      outcome: 'failure',
      statusCode: parsed.response.status,
      details: { reason: 'invalid_body' },
    })
    return parsed.response
  }

  const payload = parsed.data
  const signals = collectSignals(payload)

  if (signals.length === 0) {
    await trackSignal({
      outcome: 'failure',
      statusCode: 400,
      details: { reason: 'empty_signals' },
    })
    return errorJson(400, 'invalid_payload', 'At least one signal is required')
  }

  if (signals.length > MAX_BATCH_SIGNALS) {
    await trackSignal({
      outcome: 'blocked',
      statusCode: 413,
      details: { reason: 'batch_too_large', signalCount: signals.length },
    })
    return errorJson(413, 'payload_too_large', `Maximum ${MAX_BATCH_SIGNALS} signals per request`)
  }

  const enqueue = typeof payload.enqueue === 'boolean' ? payload.enqueue : true
  const transport = normalizeTransport(payload.transport)

  const results = await ingestSecuritySignalsBatch(signals as Array<Record<string, unknown>>, {
    enqueue,
    transport,
    drain: true,
    fallbackSource: 'external.ingest',
  })

  const accepted = results.filter((item) => item.accepted).length
  const rejected = results.filter((item) => item.rejected).length
  const dropped = results.filter((item) => item.dropped).length
  const throttled = results.filter((item) => item.error === 'queue_throttled').length

  if (accepted === 0 && throttled > 0) {
    await trackSignal({
      outcome: 'blocked',
      statusCode: 429,
      details: {
        reason: 'queue_throttled',
        enqueue,
        transport,
        signalCount: signals.length,
        accepted,
        rejected,
        dropped,
        throttled,
      },
    })
    return errorJson(429, 'queue_throttled', 'Security signal queue is throttled', {
      accepted,
      rejected,
      dropped,
      throttled,
    })
  }

  await trackSignal({
    outcome: accepted > 0 ? 'success' : 'failure',
    statusCode: accepted > 0 ? 202 : 400,
    details: {
      enqueue,
      transport,
      signalCount: signals.length,
      accepted,
      rejected,
      dropped,
      throttled,
    },
  })

  return okJson({
    queued: enqueue,
    transport,
    accepted,
    rejected,
    dropped,
    throttled,
    signalCount: signals.length,
    results,
  })
}
