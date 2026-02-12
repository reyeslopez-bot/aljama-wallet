// app/api/telemetry/route.ts
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { recordTelemetryEvent } from '@/services/telemetry.service'
import crypto from 'node:crypto'
import { buildRateLimitKey, rateLimit } from '@/lib/security/rate-limit'
import { errorJson, okJson } from '@/lib/security/api-response'
import { logError } from '@/lib/security/logging'

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

export async function POST(req: NextRequest) {
  try {
    const rateKey = buildRateLimitKey(req, null)
    const limit = rateLimit({
      bucket: 'telemetry',
      key: rateKey,
      limit: 120,
      windowMs: 60_000,
    })
    if (!limit.ok) {
      return errorJson(429, 'rate_limited', 'Too many requests', {
        retryAfter: limit.retryAfter,
      })
    }

    const ipHeader =
      req.headers.get('x-forwarded-for') ??
      req.headers.get('x-real-ip') ??
      (req as NextRequest & { ip?: string }).ip ??
      ''
    const ip = ipHeader.split(',')[0]?.trim() || null
    const ipHash = ip ? crypto.createHash('sha256').update(ip).digest('hex') : null

    const geo = {
      country: req.headers.get('x-vercel-ip-country') ?? null,
      region: req.headers.get('x-vercel-ip-country-region') ?? null,
      city: req.headers.get('x-vercel-ip-city') ?? null,
      latitude: req.headers.get('x-vercel-ip-latitude') ?? null,
      longitude: req.headers.get('x-vercel-ip-longitude') ?? null,
      timezone: req.headers.get('x-vercel-ip-timezone') ?? null,
    }

    const declaredSize = req.headers.get('content-length')
    if (declaredSize && Number(declaredSize) > MAX_BODY_BYTES) {
      return errorJson(413, 'payload_too_large', 'Request body exceeds limit')
    }

    const raw = await req.text()
    if (raw.length > MAX_BODY_BYTES) {
      return errorJson(413, 'payload_too_large', 'Request body exceeds limit')
    }

    let parsed: unknown
    try {
      parsed = raw ? JSON.parse(raw) : {}
    } catch (error) {
      logError('telemetry:invalid_json', error)
      return errorJson(400, 'invalid_json', 'Body must be valid JSON')
    }

    const validation = telemetrySchema.safeParse(parsed)
    if (!validation.success) {
      return errorJson(400, 'invalid_payload', 'Validation failed', validation.error.format())
    }

    const enrichedContext = {
      ...validation.data.context,
      server: {
        ipHash,
        geo,
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

    return okJson({})
  } catch (error) {
    logError('telemetry', error)
    return errorJson(500, 'server_error', 'Unexpected error')
  }
}
