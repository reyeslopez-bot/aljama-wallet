import { PrismaClient } from '../../prisma/generated/prisma-crdb'

declare global {
  var prismaCrdb: PrismaClient | undefined
}

export const prismaCrdb: PrismaClient =
  globalThis.prismaCrdb ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalThis.prismaCrdb = prismaCrdb
}
