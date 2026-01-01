import { PrismaClient } from '@/prisma/generated/pg'

declare global {
  // TS global, not eslint "var"
  // eslint-disable-next-line no-redeclare
  var __prismaPg: PrismaClient | undefined
}

function makePrismaPg() {
  const url =
    process.env.PG_DATABASE_URL ??
    process.env.POSTGRES_URL ??
    process.env.DATABASE_URL_PG

  if (!url) {
    throw new Error('Missing PG_DATABASE_URL (or POSTGRES_URL / DATABASE_URL_PG)')
  }

  return new PrismaClient({
    datasources: { db: { url } },
  })
}

/**
 * Lazy getter. Avoids crashing Next build on module import.
 */
export function prismaPg() {
  return (globalThis.__prismaPg ??= makePrismaPg())
}