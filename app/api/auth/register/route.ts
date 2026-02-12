import { NextResponse } from 'next/server'
import { z } from 'zod'
import { hashPassword } from '@/lib/auth/password'
import { createUser, findUserByEmail } from '@/lib/auth/store'
import { buildRateLimitKey, rateLimit } from '@/lib/security/rate-limit'
import { isAllowedOrigin } from '@/lib/security/origin'
import { isStrictMode } from '@/lib/security/runtime'

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
  try {
    if (!isAllowedOrigin(req)) {
      return NextResponse.json({ ok: false, error: 'INVALID_ORIGIN' }, { status: 403 })
    }

    const rateKey = buildRateLimitKey(req, null)
    const limit = rateLimit({
      bucket: 'auth-register',
      key: rateKey,
      limit: 10,
      windowMs: 60_000,
    })
    if (!limit.ok) {
      return NextResponse.json(
        { ok: false, error: 'RATE_LIMITED', retryAfter: limit.retryAfter },
        { status: 429, headers: { 'retry-after': String(limit.retryAfter) } },
      )
    }

    const body = await req.json().catch(() => ({}))
    const parsed = registerSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'Invalid registration payload', details: parsed.error.format() },
        { status: 400 },
      )
    }

    const envInvite = process.env.AUTH_INVITE_TOKEN?.trim()
    const expectedInvite = envInvite ?? (isStrictMode ? null : 'demo-invite')
    if (!expectedInvite) {
      return NextResponse.json(
        { ok: false, error: 'INVITE_TOKEN_NOT_CONFIGURED' },
        { status: 503 },
      )
    }
    const providedInvite = parsed.data.inviteToken.trim()
    if (providedInvite !== expectedInvite) {
      return NextResponse.json(
        { ok: false, error: 'Invalid invite token' },
        { status: 401 },
      )
    }

    const email = parsed.data.email.trim().toLowerCase()
    const existing = await findUserByEmail(email)
    if (existing) {
      return NextResponse.json(
        { ok: false, error: 'User already exists' },
        { status: 409 },
      )
    }

    const passwordHash = await hashPassword(parsed.data.password)
    const user = await createUser({ email, passwordHash })

    return NextResponse.json({ ok: true, user: { id: user.id, email: user.email } })
  } catch (error) {
    console.error('register error', error)
    const message =
      error instanceof Error && process.env.NODE_ENV !== 'production'
        ? error.message
        : 'Failed to register'
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    )
  }
}
