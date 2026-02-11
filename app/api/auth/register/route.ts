import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prismaPg } from '@/lib/prisma-pg'
import { hashPassword } from '@/lib/auth/password'

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
    const body = await req.json().catch(() => ({}))
    const parsed = registerSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'Invalid registration payload', details: parsed.error.format() },
        { status: 400 },
      )
    }

    const expectedInvite = process.env.AUTH_INVITE_TOKEN?.trim() ?? 'demo-invite'
    const providedInvite = parsed.data.inviteToken.trim()
    if (providedInvite !== expectedInvite) {
      return NextResponse.json(
        { ok: false, error: 'Invalid invite token' },
        { status: 401 },
      )
    }

    const email = parsed.data.email.trim().toLowerCase()
    const existing = await prismaPg.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json(
        { ok: false, error: 'User already exists' },
        { status: 409 },
      )
    }

    const passwordHash = await hashPassword(parsed.data.password)
    const user = await prismaPg.user.create({
      data: {
        email,
        passwordHash,
      },
      select: {
        id: true,
        email: true,
      },
    })

    return NextResponse.json({ ok: true, user })
  } catch (error) {
    console.error('register error', error)
    return NextResponse.json(
      { ok: false, error: 'Failed to register' },
      { status: 500 },
    )
  }
}
