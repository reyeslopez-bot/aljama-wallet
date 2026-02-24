import { z } from 'zod'
import { hashPassword } from '@/lib/auth/password'
import { createUser, findUserByEmail } from '@/lib/auth/store'
import { buildRateLimitKey, rateLimit } from '@/lib/security/rate-limit'
import { isAllowedOrigin } from '@/lib/security/origin'
import { isStrictMode } from '@/lib/security/runtime'
import { errorJson, okJson } from '@/lib/security/api-response'
import { readJsonBody } from '@/lib/security/request-body'
import { logError } from '@/lib/security/logging'
import { getErrorMessage } from '@/lib/security/errors'
import { recordSecuritySignal } from '@/services/security-anomaly.service'
import { extractRequestSignalContext } from '@/lib/security/request-signal'

const passwordSchema = z
  .string()
  .min(12)
  .max(128)
  .regex(/[a-z]/, 'Password needs a lowercase letter')
  .regex(/[A-Z]/, 'Password needs an uppercase letter')
  .regex(/\d/, 'Password needs a number')
  .regex(/[^\w\s]/, 'Password needs a symbol')

const registerSchema = z.object({
  email: z.string().email().max(256),
  password: passwordSchema,
  inviteToken: z.string().min(1).max(128),
})

export async function POST(req: Request) {
  const signalContext = extractRequestSignalContext(req)
  const trackSignal = async (input: {
    outcome: 'success' | 'failure' | 'blocked'
    statusCode: number
    principal?: string | null
    details?: Record<string, unknown>
  }) => {
    try {
      await recordSecuritySignal({
        source: 'auth.register',
        route: '/api/auth/register',
        outcome: input.outcome,
        statusCode: input.statusCode,
        ipHash: signalContext.ipHash,
        principal: input.principal ?? null,
        country: signalContext.country,
        latitude: signalContext.latitude,
        longitude: signalContext.longitude,
        userAgent: signalContext.userAgent,
        details: input.details,
      })
    } catch (error) {
      logError('auth-register:signal', error)
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
      bucket: 'auth-register',
      key: rateKey,
      limit: 10,
      windowMs: 60_000,
    })
    if (!limit.ok) {
      await trackSignal({
        outcome: 'blocked',
        statusCode: 429,
        details: { reason: 'rate_limited', retryAfter: limit.retryAfter },
      })
      return errorJson(
        429,
        'rate_limited',
        'RATE_LIMITED',
        { retryAfter: limit.retryAfter },
        { headers: { 'retry-after': String(limit.retryAfter) } },
      )
    }

    const bodyResult = await readJsonBody(req, { maxBytes: 8_192 })
    if (!bodyResult.ok) {
      return bodyResult.response
    }

    const body = bodyResult.data
    const parsed = registerSchema.safeParse(body)
    if (!parsed.success) {
      await trackSignal({
        outcome: 'failure',
        statusCode: 400,
        details: { reason: 'invalid_payload' },
      })
      return errorJson(400, 'invalid_payload', 'Invalid registration payload', parsed.error.format())
    }

    const envInvite = process.env.AUTH_INVITE_TOKEN?.trim()
    const expectedInvite = envInvite ?? (isStrictMode ? null : 'demo-invite')
    if (!expectedInvite) {
      await trackSignal({
        outcome: 'failure',
        statusCode: 503,
        principal: parsed.data.email,
        details: { reason: 'invite_token_missing' },
      })
      return errorJson(503, 'invite_token_missing', 'INVITE_TOKEN_NOT_CONFIGURED')
    }
    const providedInvite = parsed.data.inviteToken.trim()
    if (providedInvite !== expectedInvite) {
      await trackSignal({
        outcome: 'failure',
        statusCode: 401,
        principal: parsed.data.email,
        details: { reason: 'invalid_invite' },
      })
      return errorJson(401, 'invalid_invite', 'Invalid invite token')
    }

    const email = parsed.data.email.trim().toLowerCase()
    const existing = await findUserByEmail(email)
    if (existing) {
      await trackSignal({
        outcome: 'failure',
        statusCode: 409,
        principal: email,
        details: { reason: 'user_exists' },
      })
      return errorJson(409, 'user_exists', 'User already exists')
    }

    const passwordHash = await hashPassword(parsed.data.password)
    const user = await createUser({ email, passwordHash })

    await trackSignal({
      outcome: 'success',
      statusCode: 200,
      principal: email,
      details: { reason: 'registered' },
    })

    return okJson({ user: { id: user.id, email: user.email } })
  } catch (error) {
    logError('auth-register', error)
    await trackSignal({
      outcome: 'failure',
      statusCode: 500,
      details: { reason: 'server_error' },
    })
    const message =
      process.env.NODE_ENV !== 'production'
        ? getErrorMessage(error, 'Failed to register')
        : 'Failed to register'
    return errorJson(500, 'register_failed', message)
  }
}
