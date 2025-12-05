// infra/db/prisma-pg.ts
import { PrismaClient as PrismaClientPg } from '@/prisma/generated/pg'

const globalForPg = globalThis as unknown as {
  prismaPg?: PrismaClientPg
}

export const prismaPg =
  globalForPg.prismaPg ??
  new PrismaClientPg({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPg.prismaPg = prismaPg
}
