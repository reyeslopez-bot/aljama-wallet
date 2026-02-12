import { prismaPg } from '@/lib/prisma-pg'
import crypto from 'node:crypto'
import { isStrictMode } from '@/lib/security/runtime'

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
      console.warn('transfer log write failed, falling back to memory', error)
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
      console.warn('transfer log update failed, falling back to memory', error)
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
      console.warn('transfer log read failed, falling back to memory', error)
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
