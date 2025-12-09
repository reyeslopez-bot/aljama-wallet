import { PrismaClient } from '../../prisma/generated/pg'

declare global {
  var prismaPg: PrismaClient | undefined
}

export const prismaPg: PrismaClient =
  globalThis.prismaPg ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalThis.prismaPg = prismaPg
}
