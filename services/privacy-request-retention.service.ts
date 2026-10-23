import { prismaPg } from '@/lib/prisma-pg'

const REQUEST_RETENTION_DAYS = 90
const CONSENT_RECEIPT_RETENTION_DAYS = 90
const CLEANUP_BATCH_SIZE = 500

export async function purgeResolvedPrivacyRequests(now = new Date()): Promise<number> {
  if (!process.env.PG_DATABASE_URL && !process.env.POSTGRES_URL) {
    throw new Error('PostgreSQL must be configured to purge privacy requests')
  }

  const cutoff = new Date(now.getTime() - REQUEST_RETENTION_DAYS * 24 * 60 * 60 * 1000)
  const expired = await prismaPg.privacyRequest.findMany({
    where: { resolvedAt: { lt: cutoff } },
    select: { id: true },
    orderBy: { resolvedAt: 'asc' },
    take: CLEANUP_BATCH_SIZE,
  })
  if (expired.length === 0) return 0

  const ids = expired.map(({ id }) => id)
  return prismaPg.$transaction(async (tx) => {
    await tx.privacyRequestEvent.deleteMany({ where: { requestId: { in: ids } } })
    const deleted = await tx.privacyRequest.deleteMany({
      where: { id: { in: ids }, resolvedAt: { lt: cutoff } },
    })
    return deleted.count
  })
}

export async function purgeExpiredConsentReceipts(now = new Date()): Promise<number> {
  if (!process.env.PG_DATABASE_URL && !process.env.POSTGRES_URL) {
    throw new Error('PostgreSQL must be configured to purge consent receipts')
  }

  const cutoff = new Date(now.getTime() - CONSENT_RECEIPT_RETENTION_DAYS * 24 * 60 * 60 * 1000)
  const expired = await prismaPg.consentReceipt.findMany({
    where: { createdAt: { lt: cutoff } },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
    take: CLEANUP_BATCH_SIZE,
  })
  if (expired.length === 0) return 0

  const deleted = await prismaPg.consentReceipt.deleteMany({
    where: {
      id: { in: expired.map(({ id }) => id) },
      createdAt: { lt: cutoff },
    },
  })
  return deleted.count
}
