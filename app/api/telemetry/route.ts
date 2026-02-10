// app/api/telemetry/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { recordTelemetryEvent } from '@/services/telemetry.service'

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

const errorResponse = (status: number, code: string, message: string, details?: unknown) =>
  NextResponse.json(
    {
      ok: false,
      error: {
        code,
        message,
        details,
      },
    },
    { status },
  )

export async function POST(req: NextRequest) {
  try {
    const declaredSize = req.headers.get('content-length')
    if (declaredSize && Number(declaredSize) > MAX_BODY_BYTES) {
      return errorResponse(413, 'payload_too_large', 'Request body exceeds limit')
    }

    const raw = await req.text()
    if (raw.length > MAX_BODY_BYTES) {
      return errorResponse(413, 'payload_too_large', 'Request body exceeds limit')
    }

    let parsed: unknown
    try {
      parsed = raw ? JSON.parse(raw) : {}
    } catch (error) {
      console.error('telemetry invalid json', error)
      return errorResponse(400, 'invalid_json', 'Body must be valid JSON')
    }

    const validation = telemetrySchema.safeParse(parsed)
    if (!validation.success) {
      return errorResponse(400, 'invalid_payload', 'Validation failed', validation.error.format())
    }

    await recordTelemetryEvent({
      event: validation.data.event,
      sessionId: validation.data.sessionId,
      deviceId: validation.data.deviceId,
      path: validation.data.path ?? null,
      context: validation.data.context ?? null,
      payload: validation.data.payload ?? null,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('telemetry error', error)
    return errorResponse(500, 'server_error', 'Unexpected error')
  }
}
