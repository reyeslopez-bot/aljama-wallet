// app/api/track-wallet/route.ts
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { recordTrackWalletEvent } from '@/services/track-wallet.service'
import { buildRateLimitKey, rateLimit } from '@/lib/security/rate-limit'
import { errorJson, okJson } from '@/lib/security/api-response'
import { logError } from '@/lib/security/logging'

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

export async function POST(req: NextRequest) {
  try {
    const rateKey = buildRateLimitKey(req, null)
    const limit = rateLimit({
      bucket: 'track-wallet',
      key: rateKey,
      limit: 60,
      windowMs: 60_000,
    })
    if (!limit.ok) {
      return errorJson(429, 'rate_limited', 'Too many requests', {
        retryAfter: limit.retryAfter,
      })
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
      logError('track-wallet:invalid_json', error)
      return errorJson(400, 'invalid_json', 'Body must be valid JSON')
    }

    const validation = trackWalletSchema.safeParse(parsed)
    if (!validation.success) {
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

    return okJson({})
  } catch (error: unknown) {
    logError('track-wallet', error)
    return errorJson(500, 'server_error', 'Unexpected error')
  }
}
