// app/api/track-wallet/route.ts
import { z } from 'zod'
import { recordTrackWalletEvent } from '@/services/track-wallet.service'
import { buildRateLimitKey, rateLimit } from '@/lib/security/rate-limit'
import { errorJson, okJson } from '@/lib/security/api-response'
import { withApiRoute, type ApiRouteContext } from '@/lib/security/api-route'
import { isAllowedOrigin } from '@/lib/security/origin'
import { logError } from '@/lib/security/logging'
import { recordSecuritySignal } from '@/services/security-anomaly.service'
import { extractRequestSignalContext } from '@/lib/security/request-signal'

export type TrackWalletEvent = {
  address: string
  chain: {
    id: number | null
    name: string | null
  }
  connector: {
    id: string | null
    name: string | null
    type: string | null
  }
  userAgent: string | null
  timestamp: string
  receivedAt: number
}

const MAX_BODY_BYTES = 4_096

const trackWalletSchema = z.object({
  address: z.string().min(1),
  chain: z.object({ id: z.number().int().nullable(), name: z.string().nullable() }),
  connector: z.object({ id: z.string().nullable(), name: z.string().nullable(), type: z.string().nullable() }),
  userAgent: z.string().nullable(),
  timestamp: z.string().datetime(),
})

async function postTrackWallet(
  req: Request,
  routeContext: Pick<ApiRouteContext, 'requestId' | 'traceId' | 'correlationId'>,
) {
  const signalContext = extractRequestSignalContext(req)
  const routePath = '/api/track-wallet'
  const trackSignal = async (input: {
    outcome: 'success' | 'failure' | 'blocked'
    statusCode: number
    principal?: string | null
    details?: Record<string, unknown>
  }) => {
    try {
      await recordSecuritySignal({
        source: 'wallet.track',
        route: routePath,
        outcome: input.outcome,
        statusCode: input.statusCode,
        ipHash: signalContext.ipHash,
        principal: input.principal ?? null,
        country: signalContext.country,
        latitude: signalContext.latitude,
        longitude: signalContext.longitude,
        userAgent: signalContext.userAgent,
        traceId: routeContext.traceId,
        details: input.details,
      })
    } catch (error) {
      logError('track-wallet:signal', error, {
        requestId: routeContext.requestId,
        traceId: routeContext.traceId,
        route: routePath,
      })
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
    const limit = await rateLimit({
      bucket: 'track-wallet',
      key: rateKey,
      limit: 60,
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
      logError('track-wallet:invalid_json', error)
      await trackSignal({
        outcome: 'failure',
        statusCode: 400,
        details: { reason: 'invalid_json' },
      })
      return errorJson(400, 'invalid_json', 'Body must be valid JSON')
    }

    const validation = trackWalletSchema.safeParse(parsed)
    if (!validation.success) {
      await trackSignal({
        outcome: 'failure',
        statusCode: 400,
        details: { reason: 'invalid_payload' },
      })
      return errorJson(400, 'invalid_payload', 'Validation failed', validation.error.format())
    }

    const event: TrackWalletEvent = {
      ...validation.data,
      receivedAt: Date.now(),
    }

    await recordTrackWalletEvent({
      address: event.address,
      chainId: event.chain.id,
      chainName: event.chain.name,
      connectorId: event.connector.id,
      connectorName: event.connector.name,
      connectorType: event.connector.type,
      userAgent: event.userAgent,
      timestamp: event.timestamp,
      receivedAt: event.receivedAt,
    })

    await trackSignal({
      outcome: 'success',
      statusCode: 200,
      principal: event.address,
      details: {
        chainId: event.chain.id ?? null,
        connector: event.connector.id ?? null,
      },
    })

    return okJson({})
  } catch (error: unknown) {
    logError('track-wallet', error)
    await trackSignal({
      outcome: 'failure',
      statusCode: 500,
      details: { reason: 'server_error' },
    })
    return errorJson(500, 'server_error', 'Unexpected error')
  }
}

export const POST = withApiRoute({ scope: 'api:track-wallet', timeoutMs: 5_000 }, postTrackWallet)
