// prisma/crdb/prisma.config.ts
import { defineConfig } from 'prisma/config'

export default defineConfig({
  datasource: {
    // Prisma 7 expects a *single* datasource object here, not { db: { ... } }
    url: process.env.COCKROACH_URL ?? '',
  },
})
