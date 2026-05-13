// Starter seed — replace with your own data.
import { config } from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '../prisma/generated/pg/index.js'
import { PrismaPg } from '@prisma/adapter-pg'

const dir = path.dirname(fileURLToPath(import.meta.url))
config({ path: path.resolve(dir, '../.env') })
config({ path: path.resolve(dir, '../.env.local'), override: true })

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.PG_DATABASE_URL ?? process.env.POSTGRES_URL,
  }),
})

async function main() {
  const signup = await prisma.signup.upsert({
    where: { email: 'seed@aljama.dev' },
    update: {},
    create: { email: 'seed@aljama.dev', region: 'EU', source: 'seed' },
  })

  const telemetry = await prisma.telemetryEvent.create({
    data: {
      event: 'seed.run',
      sessionId: 'seed-session',
      deviceId: 'seed-device',
      traceId: 'seed-trace',
      path: '/seed',
      schemaVersion: '1',
    },
  })

  console.log('Seeded signup:', signup.id)
  console.log('Seeded telemetry event:', telemetry.id)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
