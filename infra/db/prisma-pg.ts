// infra/db/prisma-pg.ts
import { PrismaClient as PrismaClientPg } from '../../prisma/generated/pg'

const globalForPg = globalThis as unknown as {
  prismaPg?: PrismaClientPg
}

export const prismaPg =
  globalForPg.prismaPg ??
  new PrismaClientPg({
    datasourceUrl: process.env.PG_DATABASE_URL,
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPg.prismaPg = prismaPg
}
