// infra/utils/summary.service.ts
import { prismaPg } from '@/infra/db/prisma'

export const getDailySummaries = async () => {
  // CI: don’t require DB connectivity
  if (process.env.CI === 'true') return []

  // Prefer explicit PG env name used by prismaPg()
  const pgUrl =
    process.env.PG_DATABASE_URL ??
    process.env.POSTGRES_URL ??
    process.env.DATABASE_URL_PG

  // Local dev without PG configured: return empty instead of crashing build/runtime
  if (!pgUrl) return []

  return prismaPg().dailyTransactionSummary.findMany()
}
