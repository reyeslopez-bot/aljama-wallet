// services/signup.service.ts
import { prismaPg } from '@/lib/prisma-pg'

export type SignupInput = {
  email: string
  region?: string | null
  source?: string | null
}

export async function upsertSignup(input: SignupInput) {
  const email = input.email.trim().toLowerCase()
  if (!email) throw new Error('email is required')

  return prismaPg.signup.upsert({
    where: { email },
    update: {
      region: input.region ?? null,
      source: input.source ?? null,
    },
    create: {
      email,
      region: input.region ?? null,
      source: input.source ?? null,
    },
    select: {
      id: true,
      email: true,
      region: true,
      source: true,
      createdAt: true,
      updatedAt: true,
    },
  })
}
