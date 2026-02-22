import { prismaPg } from '@/lib/prisma-pg'
import crypto from 'node:crypto'
import { isStrictMode } from '@/lib/security/runtime'
import { logWarn } from '@/lib/security/logging'

export type TransferStatus = 'initiated' | 'approved' | 'broadcast' | 'failed' | 'denied' | 'review'

export type TransferLogInput = {
  walletId: string
  userId?: string | null
  chainId: number
  toAddress: string
  amountWei: bigint
  status: TransferStatus
  idempotencyKey: string
}

export type TransferLogRecord = TransferLogInput & { id: string; createdAt: number }

const MAX_EVENTS = 5000

const globalForTransfers = globalThis as unknown as {
  transferLogs?: TransferLogRecord[]
}

const memoryLogs = globalForTransfers.transferLogs ?? []
if (!globalForTransfers.transferLogs) {
  globalForTransfers.transferLogs = memoryLogs
}

function canUsePg() {
  return Boolean(process.env.PG_DATABASE_URL ?? process.env.POSTGRES_URL)
}

function normalizeAddress(address: string): string {
  return address.trim().toLowerCase()
}

function mapDbRecord(record: {
  id: string
  walletId: string
  userId: string | null
  chainId: number
  toAddress: string
  amountWei: bigint
  status: string
  idempotencyKey: string
  createdAt: Date
}): TransferLogRecord {
  return {
    id: record.id,
    walletId: record.walletId,
    userId: record.userId,
    chainId: record.chainId,
    toAddress: record.toAddress,
    amountWei: record.amountWei,
    status: record.status as TransferStatus,
    idempotencyKey: record.idempotencyKey,
    createdAt: record.createdAt.getTime(),
  }
}

export async function recordTransferAttempt(input: TransferLogInput): Promise<{ id: string }> {
  if (canUsePg()) {
    try {
      const record = await prismaPg.walletTransferLog.create({
        data: {
          walletId: input.walletId,
          userId: input.userId ?? null,
          chainId: input.chainId,
          toAddress: normalizeAddress(input.toAddress),
          amountWei: input.amountWei,
          status: input.status,
          idempotencyKey: input.idempotencyKey,
        },
        select: { id: true },
      })
      return { id: record.id }
    } catch (error) {
      if (isStrictMode) throw error
      logWarn('transfer-log:write', error)
    }
  }

  const id = `mem_${crypto.randomUUID()}`
  memoryLogs.push({
    ...input,
    toAddress: normalizeAddress(input.toAddress),
    id,
    createdAt: Date.now(),
  })
  if (memoryLogs.length > MAX_EVENTS) {
    memoryLogs.splice(0, memoryLogs.length - MAX_EVENTS)
  }
  return { id }
}

export async function updateTransferStatus(id: string, status: TransferStatus) {
  if (canUsePg()) {
    try {
      await prismaPg.walletTransferLog.update({
        where: { id },
        data: { status },
      })
      return
    } catch (error) {
      if (isStrictMode) throw error
      logWarn('transfer-log:update', error)
    }
  }

  const idx = memoryLogs.findIndex((log) => log.id === id)
  if (idx >= 0) {
    memoryLogs[idx] = { ...memoryLogs[idx], status }
  }
}

export async function getRecentTransferStats(params: {
  walletId: string
  chainId: number
  toAddress: string
  windowMs: number
}) {
  const since = new Date(Date.now() - params.windowMs)
  const normalizedTo = normalizeAddress(params.toAddress)

  if (canUsePg()) {
    try {
      const [recentCount, destCount, chainCount] = await Promise.all([
        prismaPg.walletTransferLog.count({
          where: { walletId: params.walletId, createdAt: { gte: since } },
        }),
        prismaPg.walletTransferLog.count({
          where: { walletId: params.walletId, toAddress: normalizedTo },
        }),
        prismaPg.walletTransferLog.count({
          where: { walletId: params.walletId, chainId: params.chainId },
        }),
      ])

      return {
        recentCount,
        destinationCount: destCount,
        chainCount,
      }
    } catch (error) {
      if (isStrictMode) throw error
      logWarn('transfer-log:read', error)
    }
  }

  const recentCount = memoryLogs.filter(
    (log) => log.walletId === params.walletId && log.createdAt >= since.getTime(),
  ).length

  const destinationCount = memoryLogs.filter(
    (log) => log.walletId === params.walletId && log.toAddress === normalizedTo,
  ).length

  const chainCount = memoryLogs.filter(
    (log) => log.walletId === params.walletId && log.chainId === params.chainId,
  ).length

  return { recentCount, destinationCount, chainCount }
}

export function getTransferLogAuthority(): 'postgres' | 'memory' {
  return canUsePg() ? 'postgres' : 'memory'
}

export async function listTransferAttempts(params: {
  walletId: string
  limit?: number
  before?: Date | null
}): Promise<TransferLogRecord[]> {
  const limit = Math.min(Math.max(params.limit ?? 25, 1), 200)
  const before = params.before ?? null

  if (canUsePg()) {
    try {
      const records = await prismaPg.walletTransferLog.findMany({
        where: {
          walletId: params.walletId,
          ...(before ? { createdAt: { lt: before } } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      })
      return records.map(mapDbRecord)
    } catch (error) {
      if (isStrictMode) throw error
      logWarn('transfer-log:list', error)
    }
  }

  return memoryLogs
    .filter((log) => {
      if (log.walletId !== params.walletId) return false
      if (!before) return true
      return log.createdAt < before.getTime()
    })
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit)
}

export async function countTransferAttempts(params: {
  walletId: string
  since?: Date | null
}): Promise<number> {
  const since = params.since ?? null

  if (canUsePg()) {
    try {
      return await prismaPg.walletTransferLog.count({
        where: {
          walletId: params.walletId,
          ...(since ? { createdAt: { gte: since } } : {}),
        },
      })
    } catch (error) {
      if (isStrictMode) throw error
      logWarn('transfer-log:count', error)
    }
  }

  return memoryLogs.filter((log) => {
    if (log.walletId !== params.walletId) return false
    if (!since) return true
    return log.createdAt >= since.getTime()
  }).length
}

export async function getLatestTransferAttempt(walletId: string): Promise<TransferLogRecord | null> {
  if (canUsePg()) {
    try {
      const record = await prismaPg.walletTransferLog.findFirst({
        where: { walletId },
        orderBy: { createdAt: 'desc' },
      })
      return record ? mapDbRecord(record) : null
    } catch (error) {
      if (isStrictMode) throw error
      logWarn('transfer-log:latest', error)
    }
  }

  const [latest] = memoryLogs
    .filter((log) => log.walletId === walletId)
    .sort((a, b) => b.createdAt - a.createdAt)
  return latest ?? null
}
