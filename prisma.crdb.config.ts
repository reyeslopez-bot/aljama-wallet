// prisma.crdb.config.ts
import 'dotenv/config'
import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/crdb/schema.prisma',
  datasource: {
    url: process.env.CRDB_DATABASE_URL!,
  },
})
