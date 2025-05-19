import { prismaPg } from '@/lib/prisma-pg'

export const getDailySummaries = async () => {
    return await prismaPg.dailyTransactionSummary.findMany()
}

