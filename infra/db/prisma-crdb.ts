// infra/db/prisma-crdb.ts
import { PrismaClient as PrismaClientCrdb } from '@/prisma/generated/prisma-crdb'

const globalForCrdb = globalThis as unknown as {
  prismaCrdb?: PrismaClientCrdb
}

export const prismaCrdb =
  globalForCrdb.prismaCrdb ??
  new PrismaClientCrdb({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForCrdb.prismaCrdb = prismaCrdb
}
