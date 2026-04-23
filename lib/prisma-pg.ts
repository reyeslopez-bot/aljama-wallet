import { PrismaClient } from "@/prisma/generated/pg"
import { PrismaPg } from "@prisma/adapter-pg"

const globalForPrisma = globalThis as unknown as {
  prismaPg?: PrismaClient
}

export const prismaPg =
  globalForPrisma.prismaPg ??
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.PG_DATABASE_URL ?? process.env.POSTGRES_URL,
    }),
  })

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prismaPg = prismaPg
}
