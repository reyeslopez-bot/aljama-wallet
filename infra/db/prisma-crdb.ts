// infra/db/prisma-crdb.ts
import { PrismaClient } from "@/prisma/generated/prisma-crdb"

declare global {
  // eslint-disable-next-line no-var
  var __prismaCrdb: PrismaClient | undefined
}

function makePrismaCrdb() {
  const url =
    process.env.CRDB_DATABASE_URL ??
    process.env.COCKROACH_URL ??
    process.env.DATABASE_URL_CRDB ??
    process.env.DATABASE_URL

  if (!url) throw new Error("Missing CRDB_DATABASE_URL / COCKROACH_URL / DATABASE_URL_CRDB / DATABASE_URL")

  // keep this ONLY if TS accepts it; otherwise remove options and rely on env default
  return new PrismaClient({ datasourceUrl: url } as unknown as ConstructorParameters<typeof PrismaClient>[0])
}

export function prismaCrdb() {
  return (globalThis.__prismaCrdb ??= makePrismaCrdb())
}
