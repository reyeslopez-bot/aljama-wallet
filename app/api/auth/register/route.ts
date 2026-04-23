import { z } from 'zod'
import { hashPassword } from '@/lib/auth/password'
import { createUser, findUserByEmail, findUserByUsername } from '@/lib/auth/store'
import { buildRateLimitKey, rateLimit } from '@/lib/security/rate-limit'
import { isAllowedOrigin } from '@/lib/security/origin'
import { errorJson, okJson } from '@/lib/security/api-response'
import { withApiRoute, type ApiRouteContext } from '@/lib/security/api-route'
import { readJsonBody } from '@/lib/security/request-body'
import { logError } from '@/lib/security/logging'
import { getErrorMessage } from '@/lib/security/errors'
import { recordSecuritySignal } from '@/services/security-anomaly.service'
import { extractRequestSignalContext } from '@/lib/security/request-signal'
import { estimateDataUrlBytes } from '@/lib/dataUrl'

const passwordSchema = z
  .string()
  .min(12)
  .max(128)
  .regex(/[a-z]/, 'Password needs a lowercase letter')
  .regex(/[A-Z]/, 'Password needs an uppercase letter')
  .regex(/\d/, 'Password needs a number')
  .regex(/[^\w\s]/, 'Password needs a symbol')

const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(32)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, 'Username must use letters, numbers, dot, underscore, or dash')

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PROFILE_IMAGE_GIF_DATA_URL_PATTERN = /^data:image\/gif;base64,[A-Za-z0-9+/=]+$/
const PROFILE_IMAGE_DATA_URL_PATTERN = /^data:image\/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/
const MAX_PROFILE_IMAGE_DATA_URL_LENGTH = 1_500_000
const MAX_PROFILE_IMAGE_BYTES = 1024 * 1024

const registerSchema = z.object({
  username: usernameSchema,
  email: z.string().max(256).optional().nullable(),
  password: passwordSchema,
  image: z.string().max(MAX_PROFILE_IMAGE_DATA_URL_LENGTH).optional().nullable(),
})

async function postAuthRegister(
  req: Request,
  routeContext: Pick<ApiRouteContext, 'requestId' | 'traceId' | 'correlationId'>,
) {
  const signalContext = extractRequestSignalContext(req)
  const routePath = '/api/auth/register'
  const trackSignal = async (input: {
    outcome: 'success' | 'failure' | 'blocked'
    statusCode: number
    principal?: string | null
    details?: Record<string, unknown>
  }) => {
    try {
      await recordSecuritySignal({
        source: 'auth.register',
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
      logError('auth-register:signal', error, {
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
      bucket: 'auth-register',
      key: rateKey,
      limit: 10,
      windowMs: 60_000,
      ...(process.env.NODE_ENV === 'production' ? { requireDistributed: true as const } : {}),
    })
    if (!limit.ok) {
      const reason =
        limit.failureKind === 'backend_unavailable'
          ? 'rate_limit_backend_unavailable'
          : 'rate_limited'
      await trackSignal({
        outcome: 'blocked',
        statusCode: limit.failureKind === 'backend_unavailable' ? 503 : 429,
        details: { reason, retryAfter: limit.retryAfter },
      })
      if (limit.failureKind === 'backend_unavailable') {
        return errorJson(
          503,
          'rate_limit_backend_unavailable',
          'RATE_LIMIT_BACKEND_UNAVAILABLE',
          { retryAfter: limit.retryAfter },
          { headers: { 'retry-after': String(limit.retryAfter) } },
        )
      }
      return errorJson(
        429,
        'rate_limited',
        'RATE_LIMITED',
        { retryAfter: limit.retryAfter },
        { headers: { 'retry-after': String(limit.retryAfter) } },
      )
    }

    const bodyResult = await readJsonBody(req, { maxBytes: 2_000_000 })
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

    const username = parsed.data.username.trim().toLowerCase()
    const emailValue = parsed.data.email?.trim() ?? ''
    const email = emailValue ? emailValue.toLowerCase() : null
    const image = parsed.data.image?.trim() || null

    if (email && !EMAIL_PATTERN.test(email)) {
      await trackSignal({
        outcome: 'failure',
        statusCode: 400,
        principal: username,
        details: { reason: 'invalid_email' },
      })
      return errorJson(400, 'invalid_email', 'Invalid email address')
    }

    if (image && PROFILE_IMAGE_GIF_DATA_URL_PATTERN.test(image)) {
      await trackSignal({
        outcome: 'failure',
        statusCode: 400,
        principal: email ?? username,
        details: { reason: 'profile_image_gif_unsupported' },
      })
      return errorJson(400, 'profile_image_gif_unsupported', 'Animated GIFs are not supported')
    }

    if (image && !PROFILE_IMAGE_DATA_URL_PATTERN.test(image)) {
      await trackSignal({
        outcome: 'failure',
        statusCode: 400,
        principal: email ?? username,
        details: { reason: 'invalid_profile_image' },
      })
      return errorJson(400, 'invalid_profile_image', 'Invalid profile image payload')
    }

    if (image && estimateDataUrlBytes(image) > MAX_PROFILE_IMAGE_BYTES) {
      await trackSignal({
        outcome: 'failure',
        statusCode: 400,
        principal: email ?? username,
        details: { reason: 'profile_image_too_large' },
      })
      return errorJson(400, 'profile_image_too_large', 'Profile image exceeds 1 MB')
    }

    const existingByUsername = await findUserByUsername(username)
    if (existingByUsername) {
      await trackSignal({
        outcome: 'failure',
        statusCode: 409,
        principal: username,
        details: { reason: 'username_exists' },
      })
      return errorJson(409, 'username_exists', 'Username already exists')
    }

    if (email) {
      const existingByEmail = await findUserByEmail(email)
      if (existingByEmail) {
        await trackSignal({
          outcome: 'failure',
          statusCode: 409,
          principal: email,
          details: { reason: 'email_exists', field: 'email' },
        })
        return errorJson(409, 'email_exists', 'Email already exists', { field: 'email' })
      }
    }

    const passwordHash = await hashPassword(parsed.data.password)
    const user = await createUser({
      username,
      email,
      passwordHash,
      image,
    })

    await trackSignal({
      outcome: 'success',
      statusCode: 200,
      principal: email ?? username,
      details: { reason: 'registered' },
    })

    return okJson({
      user: {
        id: user.id,
        username: user.name ?? username,
        email: email ?? null,
        image: user.image ?? null,
      },
    })
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

export const POST = withApiRoute({ scope: 'api:auth-register', timeoutMs: 10_000 }, postAuthRegister)
