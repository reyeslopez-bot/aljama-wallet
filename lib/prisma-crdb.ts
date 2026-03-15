// lib/prisma-crdb.ts
import { PrismaClient } from "@/prisma/generated/prisma-crdb"
import { PrismaPg } from "@prisma/adapter-pg"

const globalForPrisma = globalThis as unknown as {
  prismaCrdb?: PrismaClient
}

export const prismaCrdb =
  globalForPrisma.prismaCrdb ??
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.CRDB_DATABASE_URL ?? process.env.COCKROACH_URL,
    }),
  })

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prismaCrdb = prismaCrdb
}
