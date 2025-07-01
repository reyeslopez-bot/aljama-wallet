import { PrismaClient } from '@/generated/prisma-crdb'

const globalForPrisma = globalThis as unknown as {
    prismaCrdb: PrismaClient | undefined
}

export const prismaCrdb = globalForPrisma.prismaCrdb ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prismaCrdb = prismaCrdb
}

