import { errorJson, okJson } from '@/lib/security/api-response'
import { withApiRoute, type ApiRouteContext } from '@/lib/security/api-route'
import { logError } from '@/lib/security/logging'
import { buildRateLimitKey, rateLimit } from '@/lib/security/rate-limit'
import { readJsonTextBody } from '@/lib/security/request-body'
import { extractRequestSignalContext } from '@/lib/security/request-signal'
import { securitySignalsBatchV1Schema } from '@/lib/security/event-schema'
import {
  authenticateSecuritySignalProducer,
  getSecuritySignalProducerRegistry,
  type SecuritySignalProducerAudit,
  type VerifiedSecuritySignalProducer,
} from '@/lib/security/signal-ingest-auth'
import {
  ingestSecuritySignalsBatch,
  recordSecuritySignal,
  type SecuritySignalTransport,
} from '@/services/security-anomaly.service'

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function attachProducerMetadata(signal: unknown, producer: VerifiedSecuritySignalProducer): unknown {
  const body = asRecord(signal)
  if (!body) return signal

  return {
    ...body,
    producerId: producer.producerId,
    producerType: producer.producerType,
    signatureVerified: producer.signatureVerified,
    ingestVersion: producer.ingestVersion,
  }
}

async function postSecuritySignals(
  req: Request,
  routeContext: Pick<ApiRouteContext, 'requestId' | 'traceId' | 'correlationId'>,
) {
  const signalContext = extractRequestSignalContext(req)
  const routePath = '/api/security/signals'
  let producerAudit: SecuritySignalProducerAudit | null = null
  const trackSignal = async (input: {
    outcome: 'success' | 'failure' | 'blocked'
    statusCode: number
    details?: Record<string, unknown>
    producerAudit?: SecuritySignalProducerAudit | null
  }) => {
    const audit = input.producerAudit ?? producerAudit

    try {
      await recordSecuritySignal({
        source: 'internal.security-signals',
        route: routePath,
        outcome: input.outcome,
        statusCode: input.statusCode,
        ipHash: signalContext.ipHash,
        country: signalContext.country,
        latitude: signalContext.latitude,
        longitude: signalContext.longitude,
        userAgent: signalContext.userAgent,
        producerId: audit?.producerId ?? null,
        producerType: audit?.producerType ?? null,
        signatureVerified: audit?.signatureVerified ?? false,
        ingestVersion: audit?.ingestVersion ?? null,
        traceId: routeContext.traceId,
        details: input.details,
      })
    } catch (error) {
      logError('security-signals:track', error, {
        requestId: routeContext.requestId,
        traceId: routeContext.traceId,
        route: routePath,
      })
    }
  }

  const registry = getSecuritySignalProducerRegistry()
  if (!registry.ok && registry.reason === 'disabled') {
    await trackSignal({
      outcome: 'blocked',
      statusCode: 404,
      details: { reason: 'disabled', missingProducerConfig: true },
    })
    return errorJson(404, 'disabled', 'DISABLED')
  }

  if (!registry.ok) {
    await trackSignal({
      outcome: 'blocked',
      statusCode: 503,
      details: { reason: 'invalid_producer_config' },
    })
    return errorJson(503, 'ingest_auth_unavailable', 'INGEST_AUTH_UNAVAILABLE')
  }

  const rawBodyResult = await readJsonTextBody(req, {
    maxBytes: 128 * 1024,
    allowEmpty: false,
  })
  if (!rawBodyResult.ok) {
    await trackSignal({
      outcome: 'failure',
      statusCode: rawBodyResult.response.status,
      details: { reason: 'invalid_body' },
    })
    return rawBodyResult.response
  }

  const auth = authenticateSecuritySignalProducer(req, rawBodyResult.data, registry.producers)
  if (!auth.ok) {
    await trackSignal({
      outcome: 'failure',
      statusCode: auth.status,
      producerAudit: auth.audit,
      details: { reason: auth.reason },
    })
    return errorJson(auth.status, auth.code, auth.message)
  }

  producerAudit = auth.producer

  const rateKey = producerAudit.producerId
    ? `producer:${producerAudit.producerId}`
    : buildRateLimitKey(req, null)
  const limitState = await rateLimit({
    bucket: 'security-signals',
    key: rateKey,
    limit: 60,
    windowMs: 60_000,
    ...(process.env.NODE_ENV === 'production' ? { requireDistributed: true as const } : {}),
  })

  if (!limitState.ok) {
    const reason =
      limitState.failureKind === 'backend_unavailable'
        ? 'rate_limit_backend_unavailable'
        : 'rate_limited'
    await trackSignal({
      outcome: 'blocked',
      statusCode: limitState.failureKind === 'backend_unavailable' ? 503 : 429,
      details: { reason, retryAfter: limitState.retryAfter },
    })
    if (limitState.failureKind === 'backend_unavailable') {
      return errorJson(
        503,
        'rate_limit_backend_unavailable',
        'RATE_LIMIT_BACKEND_UNAVAILABLE',
        { retryAfter: limitState.retryAfter },
        { headers: { 'retry-after': String(limitState.retryAfter) } },
      )
    }
    return errorJson(
      429,
      'rate_limited',
      'RATE_LIMITED',
      { retryAfter: limitState.retryAfter },
      { headers: { 'retry-after': String(limitState.retryAfter) } },
    )
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawBodyResult.data) as unknown
  } catch {
    await trackSignal({
      outcome: 'failure',
      statusCode: 400,
      details: { reason: 'invalid_json' },
    })
    return errorJson(400, 'invalid_json', 'Body must be valid JSON')
  }

  const validation = securitySignalsBatchV1Schema.safeParse(payload)
  if (!validation.success) {
    const batchTooLarge = validation.error.issues.some(
      (issue) => issue.code === 'too_big' && issue.path[0] === 'signals',
    )
    await trackSignal({
      outcome: batchTooLarge ? 'blocked' : 'failure',
      statusCode: batchTooLarge ? 413 : 400,
      details: {
        reason: batchTooLarge ? 'batch_too_large' : 'invalid_schema',
      },
    })
    if (batchTooLarge) {
      return errorJson(413, 'payload_too_large', 'Security signal batch exceeds limit')
    }
    return errorJson(
      400,
      'INVALID_SECURITY_SIGNAL_SCHEMA',
      'INVALID_SECURITY_SIGNAL_SCHEMA',
      validation.error.format(),
    )
  }

  const envelope = validation.data
  const enqueue = envelope.enqueue ?? true
  const transport: SecuritySignalTransport = envelope.transport ?? 'api'
  const preparedSignals = envelope.signals.map((signal) =>
    attachProducerMetadata(
      {
        ...signal,
        statusCode: signal.statusCode ?? signal.status,
        traceId: signal.traceId ?? routeContext.traceId,
      },
      auth.producer,
    ),
  )

  const results = await ingestSecuritySignalsBatch(preparedSignals as Array<Record<string, unknown>>, {
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
        signalCount: envelope.signals.length,
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
      signalCount: envelope.signals.length,
      accepted,
      rejected,
      dropped,
      throttled,
    },
  })

  return okJson({
    queued: enqueue,
    transport,
    producerId: auth.producer.producerId,
    producerType: auth.producer.producerType,
    ingestVersion: auth.producer.ingestVersion,
    accepted,
    rejected,
    dropped,
    throttled,
    signalCount: envelope.signals.length,
    results,
  })
}

export const POST = withApiRoute({ scope: 'api:security-signals', timeoutMs: 10_000 }, postSecuritySignals)
