// app/api/signup/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { upsertSignup } from '@/services/signup.service'

const signupSchema = z.object({
  email: z.string().email().max(256),
  region: z.string().max(32).optional(),
  source: z.string().max(64).optional(),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const parsed = signupSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'Invalid signup payload', details: parsed.error.format() },
        { status: 400 },
      )
    }

    const record = await upsertSignup({
      email: parsed.data.email,
      region: parsed.data.region ?? null,
      source: parsed.data.source ?? null,
    })

    return NextResponse.json({
      ok: true,
      id: record.id,
      email: record.email,
      region: record.region,
      source: record.source,
    })
  } catch (error) {
    console.error('signup error', error)
    return NextResponse.json(
      { ok: false, error: 'Failed to save signup' },
      { status: 500 },
    )
  }
}
