import { prismaPg } from '@/lib/prisma-pg'

function canUsePg() {
  return Boolean(process.env.PG_DATABASE_URL ?? process.env.POSTGRES_URL ?? process.env.DATABASE_URL_PG)
}

function startOfDayUtc(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

export async function getDailySummaries() {
  if (!canUsePg()) return []
  return prismaPg.dailyTransactionSummary.findMany({
    orderBy: { day: 'desc' },
  })
}

export async function incrementDailySummary(at: Date) {
  if (!canUsePg()) return { stored: 'skipped' as const }
  const day = startOfDayUtc(at)
  await prismaPg.dailyTransactionSummary.upsert({
    where: { day },
    update: { count: { increment: 1 } },
    create: { day, count: 1 },
  })
  return { stored: 'db' as const }
}
