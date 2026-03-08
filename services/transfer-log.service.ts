import crypto from 'node:crypto'
import type { ChainTransactionType, TransferWorkflowStatus } from '@/lib/chain-transactions'
import { normalizeTransferWorkflowStatus } from '@/lib/chain-transactions'
import { prismaPg } from '@/lib/prisma-pg'
import { logWarn } from '@/lib/security/logging'
import { isStrictMode } from '@/lib/security/runtime'

export type TransferStatus = TransferWorkflowStatus

export type TransferLogInput = {
  walletId: string
  userId?: string | null
  chainId: number
  toAddress: string
  amountWei: bigint
  status: TransferStatus
  idempotencyKey: string
  txHash?: string | null
  nonce?: string | null
  txType?: ChainTransactionType | null
  data?: string | null
  gasLimit?: string | null
  gasPrice?: string | null
  maxFeePerGas?: string | null
  maxPriorityFeePerGas?: string | null
  gasUsed?: string | null
  blockHeight?: bigint | null
  blockHash?: string | null
  replacedByTxHash?: string | null
  confirmedAt?: Date | null
}

export type TransferLogUpdateInput = {
  status?: TransferStatus
  txHash?: string | null
  nonce?: string | null
  txType?: ChainTransactionType | null
  data?: string | null
  gasLimit?: string | null
  gasPrice?: string | null
  maxFeePerGas?: string | null
  maxPriorityFeePerGas?: string | null
  gasUsed?: string | null
  blockHeight?: bigint | null
  blockHash?: string | null
  replacedByTxHash?: string | null
  confirmedAt?: Date | null
}

export type TransferLogRecord = Omit<TransferLogInput, 'confirmedAt'> & {
  id: string
  createdAt: number
  updatedAt: number
  confirmedAt: number | null
}

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

function normalizeNullableString(value?: string | null): string | null {
  if (!value?.trim()) return null
  return value.trim()
}

function toRecord(input: TransferLogInput & { id: string; createdAt: number; updatedAt: number }): TransferLogRecord {
  return {
    ...input,
    status: normalizeTransferWorkflowStatus(input.status),
    toAddress: normalizeAddress(input.toAddress),
    txHash: normalizeNullableString(input.txHash),
    nonce: normalizeNullableString(input.nonce),
    txType: input.txType ?? null,
    data: normalizeNullableString(input.data),
    gasLimit: normalizeNullableString(input.gasLimit),
    gasPrice: normalizeNullableString(input.gasPrice),
    maxFeePerGas: normalizeNullableString(input.maxFeePerGas),
    maxPriorityFeePerGas: normalizeNullableString(input.maxPriorityFeePerGas),
    gasUsed: normalizeNullableString(input.gasUsed),
    blockHash: normalizeNullableString(input.blockHash),
    replacedByTxHash: normalizeNullableString(input.replacedByTxHash),
    confirmedAt: input.confirmedAt ? input.confirmedAt.getTime() : null,
  }
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
  txHash: string | null
  nonce: string | null
  txType: string | null
  data: string | null
  gasLimit: string | null
  gasPrice: string | null
  maxFeePerGas: string | null
  maxPriorityFeePerGas: string | null
  gasUsed: string | null
  blockHeight: bigint | null
  blockHash: string | null
  replacedByTxHash: string | null
  confirmedAt: Date | null
  createdAt: Date
  updatedAt: Date
}): TransferLogRecord {
  return {
    id: record.id,
    walletId: record.walletId,
    userId: record.userId,
    chainId: record.chainId,
    toAddress: record.toAddress,
    amountWei: record.amountWei,
    status: normalizeTransferWorkflowStatus(record.status),
    idempotencyKey: record.idempotencyKey,
    txHash: record.txHash,
    nonce: record.nonce,
    txType: record.txType as ChainTransactionType | null,
    data: record.data,
    gasLimit: record.gasLimit,
    gasPrice: record.gasPrice,
    maxFeePerGas: record.maxFeePerGas,
    maxPriorityFeePerGas: record.maxPriorityFeePerGas,
    gasUsed: record.gasUsed,
    blockHeight: record.blockHeight,
    blockHash: record.blockHash,
    replacedByTxHash: record.replacedByTxHash,
    confirmedAt: record.confirmedAt?.getTime() ?? null,
    createdAt: record.createdAt.getTime(),
    updatedAt: record.updatedAt.getTime(),
  }
}

function applyTransferLogUpdates(record: TransferLogRecord, updates: TransferLogUpdateInput): TransferLogRecord {
  return {
    ...record,
    status: updates.status ? normalizeTransferWorkflowStatus(updates.status) : record.status,
    txHash: updates.txHash !== undefined ? normalizeNullableString(updates.txHash) : record.txHash,
    nonce: updates.nonce !== undefined ? normalizeNullableString(updates.nonce) : record.nonce,
    txType: updates.txType !== undefined ? updates.txType : record.txType,
    data: updates.data !== undefined ? normalizeNullableString(updates.data) : record.data,
    gasLimit: updates.gasLimit !== undefined ? normalizeNullableString(updates.gasLimit) : record.gasLimit,
    gasPrice: updates.gasPrice !== undefined ? normalizeNullableString(updates.gasPrice) : record.gasPrice,
    maxFeePerGas:
      updates.maxFeePerGas !== undefined ? normalizeNullableString(updates.maxFeePerGas) : record.maxFeePerGas,
    maxPriorityFeePerGas:
      updates.maxPriorityFeePerGas !== undefined
        ? normalizeNullableString(updates.maxPriorityFeePerGas)
        : record.maxPriorityFeePerGas,
    gasUsed: updates.gasUsed !== undefined ? normalizeNullableString(updates.gasUsed) : record.gasUsed,
    blockHeight: updates.blockHeight !== undefined ? updates.blockHeight : record.blockHeight,
    blockHash: updates.blockHash !== undefined ? normalizeNullableString(updates.blockHash) : record.blockHash,
    replacedByTxHash:
      updates.replacedByTxHash !== undefined
        ? normalizeNullableString(updates.replacedByTxHash)
        : record.replacedByTxHash,
    confirmedAt:
      updates.confirmedAt !== undefined
        ? (updates.confirmedAt ? updates.confirmedAt.getTime() : null)
        : record.confirmedAt,
    updatedAt: Date.now(),
  }
}

function buildPgUpdateData(updates: TransferLogUpdateInput) {
  return {
    ...(updates.status ? { status: normalizeTransferWorkflowStatus(updates.status) } : {}),
    ...(updates.txHash !== undefined ? { txHash: normalizeNullableString(updates.txHash) } : {}),
    ...(updates.nonce !== undefined ? { nonce: normalizeNullableString(updates.nonce) } : {}),
    ...(updates.txType !== undefined ? { txType: updates.txType } : {}),
    ...(updates.data !== undefined ? { data: normalizeNullableString(updates.data) } : {}),
    ...(updates.gasLimit !== undefined ? { gasLimit: normalizeNullableString(updates.gasLimit) } : {}),
    ...(updates.gasPrice !== undefined ? { gasPrice: normalizeNullableString(updates.gasPrice) } : {}),
    ...(updates.maxFeePerGas !== undefined
      ? { maxFeePerGas: normalizeNullableString(updates.maxFeePerGas) }
      : {}),
    ...(updates.maxPriorityFeePerGas !== undefined
      ? { maxPriorityFeePerGas: normalizeNullableString(updates.maxPriorityFeePerGas) }
      : {}),
    ...(updates.gasUsed !== undefined ? { gasUsed: normalizeNullableString(updates.gasUsed) } : {}),
    ...(updates.blockHeight !== undefined ? { blockHeight: updates.blockHeight } : {}),
    ...(updates.blockHash !== undefined ? { blockHash: normalizeNullableString(updates.blockHash) } : {}),
    ...(updates.replacedByTxHash !== undefined
      ? { replacedByTxHash: normalizeNullableString(updates.replacedByTxHash) }
      : {}),
    ...(updates.confirmedAt !== undefined ? { confirmedAt: updates.confirmedAt } : {}),
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
          status: normalizeTransferWorkflowStatus(input.status),
          idempotencyKey: input.idempotencyKey,
          txHash: normalizeNullableString(input.txHash),
          nonce: normalizeNullableString(input.nonce),
          txType: input.txType ?? null,
          data: normalizeNullableString(input.data),
          gasLimit: normalizeNullableString(input.gasLimit),
          gasPrice: normalizeNullableString(input.gasPrice),
          maxFeePerGas: normalizeNullableString(input.maxFeePerGas),
          maxPriorityFeePerGas: normalizeNullableString(input.maxPriorityFeePerGas),
          gasUsed: normalizeNullableString(input.gasUsed),
          blockHeight: input.blockHeight ?? null,
          blockHash: normalizeNullableString(input.blockHash),
          replacedByTxHash: normalizeNullableString(input.replacedByTxHash),
          confirmedAt: input.confirmedAt ?? null,
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
  memoryLogs.push(
    toRecord({
      ...input,
      id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  )
  if (memoryLogs.length > MAX_EVENTS) {
    memoryLogs.splice(0, memoryLogs.length - MAX_EVENTS)
  }
  return { id }
}

export async function updateTransferStatus(id: string, status: TransferStatus, extras?: TransferLogUpdateInput) {
  const updates: TransferLogUpdateInput = { ...(extras ?? {}), status }

  if (canUsePg()) {
    try {
      await prismaPg.walletTransferLog.update({
        where: { id },
        data: buildPgUpdateData(updates),
      })
      return
    } catch (error) {
      if (isStrictMode) throw error
      logWarn('transfer-log:update', error)
    }
  }

  const idx = memoryLogs.findIndex((log) => log.id === id)
  if (idx >= 0) {
    memoryLogs[idx] = applyTransferLogUpdates(memoryLogs[idx], updates)
  }
}

export async function updateTransferAttemptByTxHash(txHash: string, updates: TransferLogUpdateInput) {
  const normalizedTxHash = normalizeNullableString(txHash)
  if (!normalizedTxHash) return

  if (canUsePg()) {
    try {
      await prismaPg.walletTransferLog.updateMany({
        where: { txHash: normalizedTxHash },
        data: buildPgUpdateData(updates),
      })
      return
    } catch (error) {
      if (isStrictMode) throw error
      logWarn('transfer-log:update-by-txhash', error)
    }
  }

  for (let index = 0; index < memoryLogs.length; index += 1) {
    if (memoryLogs[index]?.txHash !== normalizedTxHash) continue
    memoryLogs[index] = applyTransferLogUpdates(memoryLogs[index], updates)
  }
}

export async function replaceTransferAttemptsByTxHashes(txHashes: string[], replacedByTxHash: string) {
  const normalizedTxHashes = txHashes
    .map((value) => normalizeNullableString(value))
    .filter((value): value is string => Boolean(value))

  if (normalizedTxHashes.length === 0) return

  if (canUsePg()) {
    try {
      await prismaPg.walletTransferLog.updateMany({
        where: { txHash: { in: normalizedTxHashes } },
        data: buildPgUpdateData({
          status: 'replaced',
          replacedByTxHash,
        }),
      })
      return
    } catch (error) {
      if (isStrictMode) throw error
      logWarn('transfer-log:replace-by-txhash', error)
    }
  }

  for (let index = 0; index < memoryLogs.length; index += 1) {
    const txHash = memoryLogs[index]?.txHash
    if (!txHash || !normalizedTxHashes.includes(txHash)) continue
    memoryLogs[index] = applyTransferLogUpdates(memoryLogs[index], {
      status: 'replaced',
      replacedByTxHash,
    })
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
