// prisma/crdb/prisma.config.ts

import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

export default defineConfig({
  schema: 'schema.prisma',
  migrations: {
    path: 'migrations',
  },
  datasource: {
    url: env('CRDB_DATABASE_URL'),
  },
})
