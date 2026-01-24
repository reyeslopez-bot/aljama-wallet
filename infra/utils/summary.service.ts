// infra/utils/summary.service.ts
import { prismaPg } from "@/lib/prisma-pg"

export const getDailySummaries = async () => {
  if (process.env.CI === "true") return []

  const pgUrl =
    process.env.PG_DATABASE_URL ??
    process.env.POSTGRES_URL ??
    process.env.DATABASE_URL_PG

  if (!pgUrl) return []

  // once the model exists in pg schema:
  return prismaPg.dailyTransactionSummary.findMany()
}
