// prisma.pg.config.ts
import 'dotenv/config'
import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/pg/schema.prisma',
  datasource: {
    url: process.env.PG_DATABASE_URL!,
  },
})
