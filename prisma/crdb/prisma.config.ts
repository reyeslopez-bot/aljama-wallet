// prisma/crdb/prisma.config.ts
import { defineConfig } from "prisma/config"

export default defineConfig({
  datasource: {
    url:
      process.env.CRDB_DATABASE_URL ??
      process.env.COCKROACH_URL ??
      process.env.DATABASE_URL_CRDB ??
      process.env.DATABASE_URL ??
      "",
  },
})
