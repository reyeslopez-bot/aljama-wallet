// Convenience re-export — import { prisma } from '@/lib/prisma' for the primary (Prisma Postgres) client.
// Use prismaCrdb from '@/lib/prisma-crdb' for CockroachDB operations.
export { prismaPg as prisma } from './prisma-pg'
export { prismaCrdb } from './prisma-crdb'
