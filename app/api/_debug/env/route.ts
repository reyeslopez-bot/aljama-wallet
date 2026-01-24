// app/api/_debug/env/route.ts
export async function GET() {
  return Response.json({
    PG_DATABASE_URL: process.env.PG_DATABASE_URL ?? null,
    CRDB_DATABASE_URL: process.env.CRDB_DATABASE_URL ?? null,
    NODE_ENV: process.env.NODE_ENV ?? null,
  })
}
