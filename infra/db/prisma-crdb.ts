import { PrismaClient } from '@/prisma/generated/prisma-crdb'

declare global {
  // eslint-disable-next-line no-redeclare
  var __prismaCrdb: PrismaClient | undefined
}

function makePrismaCrdb() {
  const url =
    process.env.CRDB_DATABASE_URL ??
    process.env.DATABASE_URL_CRDB ??
    process.env.DATABASE_URL

  if (!url) {
    throw new Error('Missing CRDB_DATABASE_URL (or DATABASE_URL_CRDB / DATABASE_URL)')
  }

  return new PrismaClient({
    datasources: { db: { url } },
  })
}

export function prismaCrdb() {
  return (globalThis.__prismaCrdb ??= makePrismaCrdb())
}