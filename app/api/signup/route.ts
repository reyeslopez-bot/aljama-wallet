// app/api/signup/route.ts
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { upsertSignup } from '@/services/signup.service'
import { buildRateLimitKey, rateLimit } from '@/lib/security/rate-limit'
import { errorJson, okJson } from '@/lib/security/api-response'
import { logError } from '@/lib/security/logging'
import { getErrorMessage } from '@/lib/security/errors'

const signupSchema = z.object({
  email: z.string().email().max(256),
  region: z.string().max(32).optional(),
  source: z.string().max(64).optional(),
})

export async function POST(req: NextRequest) {
  try {
    const rateKey = buildRateLimitKey(req, null)
    const limit = rateLimit({
      bucket: 'signup',
      key: rateKey,
      limit: 20,
      windowMs: 60_000,
    })
    if (!limit.ok) {
      return errorJson(
        429,
        'rate_limited',
        'RATE_LIMITED',
        { retryAfter: limit.retryAfter },
        { headers: { 'retry-after': String(limit.retryAfter) } },
      )
    }

    const body = await req.json().catch(() => ({}))
    const parsed = signupSchema.safeParse(body)
    if (!parsed.success) {
      return errorJson(400, 'invalid_payload', 'Invalid signup payload', parsed.error.format())
    }

    const record = await upsertSignup({
      email: parsed.data.email,
      region: parsed.data.region ?? null,
      source: parsed.data.source ?? null,
    })

    return okJson({
      id: record.id,
      email: record.email,
      region: record.region,
      source: record.source,
    })
  } catch (error) {
    logError('signup', error)
    return errorJson(500, 'signup_failed', getErrorMessage(error, 'Failed to save signup'))
  }
}
