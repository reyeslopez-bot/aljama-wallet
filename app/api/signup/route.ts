import { z } from 'zod'
import { upsertSignup } from '@/services/signup.service'
import { buildRateLimitKey, rateLimit } from '@/lib/security/rate-limit'
import { errorJson, okJson } from '@/lib/security/api-response'
import { readJsonBody } from '@/lib/security/request-body'
import { isAllowedOrigin } from '@/lib/security/origin'
import { logError } from '@/lib/security/logging'
import { getErrorMessage } from '@/lib/security/errors'
import { withApiRoute } from '@/lib/security/api-route'

const signupSchema = z.object({
  email: z.string().email().max(256),
  region: z.string().max(32).optional(),
  source: z.string().max(64).optional(),
})

async function postSignup(req: Request) {
  try {
    if (!isAllowedOrigin(req)) {
      return errorJson(403, 'invalid_origin', 'INVALID_ORIGIN')
    }

    const rateKey = buildRateLimitKey(req, null)
    const limit = await rateLimit({
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

    const bodyResult = await readJsonBody(req, { maxBytes: 4_096 })
    if (!bodyResult.ok) {
      return bodyResult.response
    }
    const body = bodyResult.data
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

export const POST = withApiRoute({ scope: 'api:signup', timeoutMs: 5_000 }, postSignup)
