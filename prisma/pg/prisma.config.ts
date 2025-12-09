// prisma/pg/prisma.config.ts
import { defineConfig } from 'prisma/config'

export default defineConfig({
  datasource: {
    // Use your DATABASE_URL from .env
    url: process.env.DATABASE_URL ?? '',
  },
})
