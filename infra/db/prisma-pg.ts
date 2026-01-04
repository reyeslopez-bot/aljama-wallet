// infra/db/prisma-pg.ts
import { PrismaClient } from "@/prisma/generated/pg"

declare global {
  // eslint-disable-next-line no-var
  var __prismaPg: PrismaClient | undefined
}

function makePrismaPg() {
  const url =
    process.env.PG_DATABASE_URL ??
    process.env.POSTGRES_URL ??
    process.env.DATABASE_URL_PG ??
    process.env.DATABASE_URL

  if (!url) throw new Error("Missing PG_DATABASE_URL / POSTGRES_URL / DATABASE_URL_PG / DATABASE_URL")

  return new PrismaClient({ datasourceUrl: url } as unknown as ConstructorParameters<typeof PrismaClient>[0])
}

export function prismaPg() {
  return (globalThis.__prismaPg ??= makePrismaPg())
}