// prisma.config.ts
import { defineConfig } from 'prisma/config'

export default defineConfig({
  schemaPaths: [
    {
      // CockroachDB schema
      schemaPath: 'prisma/crdb/schema.prisma',
      // where you want the generated client for CRDB
      outputPath: 'prisma/generated/prisma-crdb',
    },
    {
      // Postgres schema
      schemaPath: 'prisma/pg/schema.prisma',
      // where you want the generated client for PG
      outputPath: 'prisma/generated/prisma-pg',
    },
  ],
})
