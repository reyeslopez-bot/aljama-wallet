// app/api/telemetry/route.ts
import { z } from 'zod'
import { recordTelemetryEvent } from '@/services/telemetry.service'
import { buildRateLimitKey, rateLimit } from '@/lib/security/rate-limit'
import { errorJson, okJson } from '@/lib/security/api-response'
import { isAllowedOrigin } from '@/lib/security/origin'
import { logError } from '@/lib/security/logging'
import { recordSecuritySignal } from '@/services/security-anomaly.service'
import { extractRequestSignalContext } from '@/lib/security/request-signal'

const MAX_BODY_BYTES = 16_384

const telemetrySchema = z.object({
  event: z.string().min(1).max(64),
  ts: z.string().datetime(),
  sessionId: z.string().min(8).max(64),
  deviceId: z.string().min(8).max(64),
  path: z.string().max(512).optional(),
  context: z.record(z.string(), z.unknown()).optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
})

export async function POST(req: Request) {
  const signalContext = extractRequestSignalContext(req)
  const trackSignal = async (input: {
    outcome: 'success' | 'failure' | 'blocked'
    statusCode: number
    sessionId?: string | null
    deviceId?: string | null
    details?: Record<string, unknown>
  }) => {
    try {
      await recordSecuritySignal({
        source: 'telemetry.ingest',
        route: '/api/telemetry',
        outcome: input.outcome,
        statusCode: input.statusCode,
        ipHash: signalContext.ipHash,
        sessionId: input.sessionId ?? null,
        deviceId: input.deviceId ?? null,
        country: signalContext.country,
        latitude: signalContext.latitude,
        longitude: signalContext.longitude,
        userAgent: signalContext.userAgent,
        details: input.details,
      })
    } catch (error) {
      logError('telemetry:signal', error)
    }
  }

  try {
    if (!isAllowedOrigin(req)) {
      await trackSignal({
        outcome: 'blocked',
        statusCode: 403,
        details: { reason: 'invalid_origin' },
      })
      return errorJson(403, 'invalid_origin', 'INVALID_ORIGIN')
    }

    const rateKey = buildRateLimitKey(req, null)
    const limit = rateLimit({
      bucket: 'telemetry',
      key: rateKey,
      limit: 120,
      windowMs: 60_000,
    })
    if (!limit.ok) {
      await trackSignal({
        outcome: 'blocked',
        statusCode: 429,
        details: { reason: 'rate_limited', retryAfter: limit.retryAfter },
      })
      return errorJson(429, 'rate_limited', 'Too many requests', {
        retryAfter: limit.retryAfter,
      })
    }

    const declaredSize = req.headers.get('content-length')
    if (declaredSize && Number(declaredSize) > MAX_BODY_BYTES) {
      await trackSignal({
        outcome: 'blocked',
        statusCode: 413,
        details: { reason: 'payload_too_large', declaredSize: Number(declaredSize) },
      })
      return errorJson(413, 'payload_too_large', 'Request body exceeds limit')
    }

    const raw = await req.text()
    if (raw.length > MAX_BODY_BYTES) {
      await trackSignal({
        outcome: 'blocked',
        statusCode: 413,
        details: { reason: 'payload_too_large', observedSize: raw.length },
      })
      return errorJson(413, 'payload_too_large', 'Request body exceeds limit')
    }

    let parsed: unknown
    try {
      parsed = raw ? JSON.parse(raw) : {}
    } catch (error) {
      logError('telemetry:invalid_json', error)
      await trackSignal({
        outcome: 'failure',
        statusCode: 400,
        details: { reason: 'invalid_json' },
      })
      return errorJson(400, 'invalid_json', 'Body must be valid JSON')
    }

    const validation = telemetrySchema.safeParse(parsed)
    if (!validation.success) {
      await trackSignal({
        outcome: 'failure',
        statusCode: 400,
        details: { reason: 'invalid_payload' },
      })
      return errorJson(400, 'invalid_payload', 'Validation failed', validation.error.format())
    }

    const enrichedContext = {
      ...validation.data.context,
      server: {
        ipHash: signalContext.ipHash,
        geo: {
          country: signalContext.country,
          region: signalContext.region,
          city: signalContext.city,
          latitude: signalContext.latitude,
          longitude: signalContext.longitude,
          timezone: signalContext.timezone,
        },
      },
    }

    await recordTelemetryEvent({
      event: validation.data.event,
      sessionId: validation.data.sessionId,
      deviceId: validation.data.deviceId,
      path: validation.data.path ?? null,
      context: enrichedContext ?? null,
      payload: validation.data.payload ?? null,
    })

    await trackSignal({
      outcome: 'success',
      statusCode: 200,
      sessionId: validation.data.sessionId,
      deviceId: validation.data.deviceId,
      details: {
        event: validation.data.event,
        path: validation.data.path ?? null,
      },
    })

    return okJson({})
  } catch (error) {
    logError('telemetry', error)
    await trackSignal({
      outcome: 'failure',
      statusCode: 500,
      details: { reason: 'server_error' },
    })
    return errorJson(500, 'server_error', 'Unexpected error')
  }
}
