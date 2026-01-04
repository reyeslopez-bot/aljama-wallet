// prisma/pg/prisma.config.ts
import { defineConfig } from 'prisma/config'

export default defineConfig({
  datasource: {
    url: process.env.PG_DATABASE_URL ?? process.env.POSTGRES_URL ?? process.env.DATABASE_URL_PG ?? process.env.DATABASE_URL ?? "",
  },
})