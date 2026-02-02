// prisma/crdb/prisma.config.ts

import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { config as dotenvConfig } from 'dotenv'
import { defineConfig, env } from 'prisma/config'

// Ensure env vars are available when Prisma runs from `prisma/crdb` (dotenv defaults to CWD).
const configDir = path.dirname(fileURLToPath(import.meta.url))
dotenvConfig({ path: path.resolve(configDir, '../../.env') })
dotenvConfig({ path: path.resolve(configDir, '../../.env.local'), override: true })
dotenvConfig({ path: path.resolve(configDir, '.env'), override: true })

export default defineConfig({
  schema: 'schema.prisma',
  migrations: {
    path: 'migrations',
  },
  datasource: {
    url: env('CRDB_DATABASE_URL'),
  },
})
