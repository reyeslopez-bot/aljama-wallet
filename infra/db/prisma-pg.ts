import { PrismaClient } from '@/generated/prisma-pg'

const globalForPrisma = globalThis as unknown as {
    prismaPg: PrismaClient | undefined
}

export const prismaPg = globalForPrisma.prismaPg ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prismaPg = prismaPg
}

