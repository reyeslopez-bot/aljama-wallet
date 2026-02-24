import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as dotenvConfig } from 'dotenv'
import { defineConfig, env } from 'prisma/config'

const configDir = path.dirname(fileURLToPath(import.meta.url))
dotenvConfig({ path: path.resolve(configDir, '../../.env') })
dotenvConfig({ path: path.resolve(configDir, '../../.env.local'), override: true })
dotenvConfig({ path: path.resolve(configDir, '.env'), override: true })

const pgUrl = process.env.PG_DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim()

export default defineConfig({
  schema: 'schema.prisma',
  migrations: {
    path: 'migrations',
  },
  datasource: {
    url: pgUrl || env('POSTGRES_URL'),
  },
})
