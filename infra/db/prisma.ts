// infra/db/prisma.ts

// Try to require generated Prisma clients; if not available during type-check/build, fall back to minimal classes to avoid compile errors.
let PrismaCrdbClient: any
let PrismaPgClient: any

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
  PrismaCrdbClient = require('../../prisma/generated/prisma-crdb').PrismaClient
} catch {
  PrismaCrdbClient = class {}
}

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
  PrismaPgClient = require('../../prisma/generated/pg').PrismaClient
} catch {
  PrismaPgClient = class {}
}

declare global {
  // eslint-disable-next-line no-var
  var prismaCrdb: any
  // eslint-disable-next-line no-var
  var prismaPg: any
}

// CRDB (OLTP)
export const prismaCrdb: any =
  globalThis.prismaCrdb ??
  new PrismaCrdbClient({
    datasourceUrl: process.env.COCKROACH_URL,
  })

// PG (OLAP)
export const prismaPg: any =
  globalThis.prismaPg ??
  new PrismaPgClient({
    datasourceUrl: process.env.POSTGRES_URL,
  })

if (process.env.NODE_ENV !== 'production') {
  globalThis.prismaCrdb = prismaCrdb
  globalThis.prismaPg = prismaPg
}
