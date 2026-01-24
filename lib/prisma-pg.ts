// lib/prisma-pg.ts
import { PrismaClient } from '@/prisma/generated/prisma-crdb'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.CRDB_DATABASE_URL,
})

const adapter = new PrismaPg(pool)

export const prismaCrdb = new PrismaClient({ adapter })
