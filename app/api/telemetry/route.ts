// app/api/telemetry/route.ts
import { z } from 'zod'
import { recordTelemetryEvent } from '@/services/telemetry.service'
import { buildRateLimitKey, rateLimit } from '@/lib/security/rate-limit'
import { errorJson, okJson } from '@/lib/security/api-response'
import { isAllowedOrigin } from '@/lib/security/origin'
import { logError, logWarn } from '@/lib/security/logging'
import { recordSecuritySignal } from '@/services/security-anomaly.service'
import { extractRequestSignalContext } from '@/lib/security/request-signal'
import { withApiRoute, type ApiRouteContext } from '@/lib/security/api-route'
import { telemetryEventV1Schema } from '@/lib/security/event-schema'

const MAX_BODY_BYTES = 16_384

function buildTelemetryLogDetails(
  req: Request,
  context: ApiRouteContext,
  details?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    requestId: context.requestId,
    traceId: context.traceId,
    method: req.method,
    path: '/api/telemetry',
    contentType: req.headers.get('content-type') ?? null,
    contentLength: req.headers.get('content-length') ?? null,
    origin: req.headers.get('origin') ?? null,
    ...details,
  }
}

function mapValidationIssues(issues: z.ZodIssue[]) {
  return issues.map((issue) => ({
    code: issue.code,
    path: issue.path.join('.') || '(root)',
    message: issue.message,
  }))
}

async function postTelemetry(req: Request, context: ApiRouteContext) {
  const signalContext = extractRequestSignalContext(req)
  const scheduleTelemetryPersist = (input: Parameters<typeof recordTelemetryEvent>[0]) => {
    const handle = setTimeout(() => {
      void recordTelemetryEvent(input).catch((error) => {
        logError('telemetry:persist', error, {
          ...buildTelemetryLogDetails(req, context),
          event: input.event,
          sessionId: input.sessionId,
          deviceId: input.deviceId,
          path: input.path ?? null,
        })
      })
    }, 0)

    handle.unref?.()
  }

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
        traceId: context.traceId,
        details: input.details,
      })
    } catch (error) {
      logError('telemetry:signal', error, buildTelemetryLogDetails(req, context, {
        source: 'telemetry.ingest',
        signalOutcome: input.outcome,
        signalStatusCode: input.statusCode,
        sessionId: input.sessionId ?? null,
        deviceId: input.deviceId ?? null,
      }))
    }
  }

  try {
    if (!isAllowedOrigin(req)) {
      logWarn(
        'telemetry:blocked',
        { message: 'Rejected telemetry request due to invalid origin' },
        buildTelemetryLogDetails(req, context, { reason: 'invalid_origin' }),
      )
      await trackSignal({
        outcome: 'blocked',
        statusCode: 403,
        details: { reason: 'invalid_origin' },
      })
      return errorJson(403, 'invalid_origin', 'INVALID_ORIGIN')
    }

    const rateKey = buildRateLimitKey(req, null)
    const limit = await rateLimit({
      bucket: 'telemetry',
      key: rateKey,
      limit: 120,
      windowMs: 60_000,
    })
    if (!limit.ok) {
      logWarn(
        'telemetry:blocked',
        { message: 'Rejected telemetry request due to rate limiting' },
        buildTelemetryLogDetails(req, context, {
          reason: 'rate_limited',
          retryAfter: limit.retryAfter,
        }),
      )
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
      logWarn(
        'telemetry:blocked',
        { message: 'Rejected telemetry request because the declared payload is too large' },
        buildTelemetryLogDetails(req, context, {
          reason: 'payload_too_large',
          declaredSize: Number(declaredSize),
          maxBodyBytes: MAX_BODY_BYTES,
        }),
      )
      await trackSignal({
        outcome: 'blocked',
        statusCode: 413,
        details: { reason: 'payload_too_large', declaredSize: Number(declaredSize) },
      })
      return errorJson(413, 'payload_too_large', 'Request body exceeds limit')
    }

    const raw = await req.text()
    if (raw.length > MAX_BODY_BYTES) {
      logWarn(
        'telemetry:blocked',
        { message: 'Rejected telemetry request because the observed payload is too large' },
        buildTelemetryLogDetails(req, context, {
          reason: 'payload_too_large',
          observedSize: raw.length,
          maxBodyBytes: MAX_BODY_BYTES,
        }),
      )
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
      logError('telemetry:invalid_json', error, buildTelemetryLogDetails(req, context, {
        reason: 'invalid_json',
        observedSize: raw.length,
        rawPreview: raw.slice(0, 200),
      }))
      await trackSignal({
        outcome: 'failure',
        statusCode: 400,
        details: { reason: 'invalid_json' },
      })
      return errorJson(400, 'invalid_json', 'Body must be valid JSON')
    }

    const validation = telemetryEventV1Schema.safeParse(parsed)
    if (!validation.success) {
      logWarn(
        'telemetry:invalid_schema',
        { message: 'Telemetry payload failed schema validation' },
        buildTelemetryLogDetails(req, context, {
          reason: 'invalid_schema',
          issues: mapValidationIssues(validation.error.issues),
        }),
      )
      await trackSignal({
        outcome: 'failure',
        statusCode: 400,
        details: { reason: 'invalid_schema' },
      })
      return errorJson(
        400,
        'INVALID_TELEMETRY_SCHEMA',
        'INVALID_TELEMETRY_SCHEMA',
        validation.error.format(),
      )
    }

    const eventTraceId = validation.data.traceId
    const enrichedContext = {
      ...validation.data.context,
      server: {
        requestId: context.requestId,
        ingestTraceId: context.traceId,
        eventTraceId,
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

    scheduleTelemetryPersist({
      schemaVersion: validation.data.schemaVersion,
      event: validation.data.event,
      sessionId: validation.data.sessionId,
      deviceId: validation.data.deviceId,
      traceId: eventTraceId,
      path: validation.data.path ?? null,
      context: enrichedContext ?? null,
      payload: validation.data.payload ?? null,
    })

    return okJson({})
  } catch (error) {
    logError('telemetry', error, buildTelemetryLogDetails(req, context))
    await trackSignal({
      outcome: 'failure',
      statusCode: 500,
      details: { reason: 'server_error' },
    })
    return errorJson(500, 'server_error', 'Unexpected error')
  }
}

export const POST = withApiRoute({ scope: 'api:telemetry', timeoutMs: 5_000 }, postTelemetry)
