import { config } from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url))
config({ path: path.resolve(dir, '../.env') })
config({ path: path.resolve(dir, '../.env.local'), override: true })

import { PrismaClient } from '../prisma/generated/pg/index.js'
import { PrismaPg } from '@prisma/adapter-pg'

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.PG_DATABASE_URL ?? process.env.POSTGRES_URL,
  }),
})

async function main() {
  const signupCount = await prisma.signup.count()
  const telemetryCount = await prisma.telemetryEvent.count()
  console.log(`✅ Connected. Signups: ${signupCount}, TelemetryEvents: ${telemetryCount}`)
}

main()
  .catch((e) => { console.error('❌ Connection failed:', e.message); process.exit(1) })
  .finally(() => prisma.$disconnect())
