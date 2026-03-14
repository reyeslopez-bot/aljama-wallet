import crypto from 'node:crypto'
import type { TransactionRequest } from 'ethers'
import { z } from 'zod'
import { CHAIN_TRANSACTION_TYPES, type ChainTransactionType } from '@/lib/chain-transactions'
import { prismaPg } from '@/lib/prisma-pg'
import { logWarn } from '@/lib/security/logging'
import { isStrictMode } from '@/lib/security/runtime'
import { Prisma } from '@/prisma/generated/pg'

export const WALLET_SIGNING_INTENT_STATUSES = [
  'queued',
  'signing',
  'signed',
  'broadcasted',
  'failed',
] as const

export type WalletSigningIntentStatus = (typeof WALLET_SIGNING_INTENT_STATUSES)[number]

export const WALLET_SIGNING_INTENT_TYPE_EVM_TRANSACTION = 'evm_transaction' as const

const walletSigningIntentStatusSchema = z.enum(WALLET_SIGNING_INTENT_STATUSES)

const serializedEvmTransactionSchema = z.object({
  to: z.string().min(1),
  value: z.string().regex(/^\d+$/).optional().nullable(),
  nonce: z.number().int().nonnegative().optional().nullable(),
  gasLimit: z.string().regex(/^\d+$/).optional().nullable(),
  gasPrice: z.string().regex(/^\d+$/).optional().nullable(),
  maxFeePerGas: z.string().regex(/^\d+$/).optional().nullable(),
  maxPriorityFeePerGas: z.string().regex(/^\d+$/).optional().nullable(),
  data: z.string().optional().nullable(),
})

export type SerializedEvmTransaction = z.infer<typeof serializedEvmTransactionSchema>

export const evmTransactionSigningIntentPayloadSchema = z.object({
  kind: z.literal('evm-transaction'),
  walletId: z.string().min(3),
  chainId: z.number().int().positive(),
  fromAddress: z.string().min(1),
  toAddress: z.string().min(1),
  amountWei: z.string().regex(/^\d+$/),
  txType: z.enum(CHAIN_TRANSACTION_TYPES),
  data: z.string().optional().nullable(),
  transferLogId: z.string().optional().nullable(),
  transaction: serializedEvmTransactionSchema,
})

export type EvmTransactionSigningIntentPayload = z.infer<typeof evmTransactionSigningIntentPayloadSchema>
export type WalletSigningIntentPayload = EvmTransactionSigningIntentPayload

export type WalletSigningIntentRecord = {
  id: string
  intentType: typeof WALLET_SIGNING_INTENT_TYPE_EVM_TRANSACTION
  status: WalletSigningIntentStatus
  walletId: string
  userId: string | null
  chainId: number
  idempotencyKey: string
  correlationId: string
  transferLogId: string | null
  payload: WalletSigningIntentPayload
  signedPayload: string | null
  txHash: string | null
  errorCode: string | null
  errorDetails: Record<string, unknown> | null
  createdAt: number
  updatedAt: number
}

export type CreateWalletSigningIntentInput = {
  walletId: string
  userId?: string | null
  chainId: number
  idempotencyKey: string
  correlationId: string
  transferLogId?: string | null
  payload: WalletSigningIntentPayload
}

export type UpdateWalletSigningIntentInput = {
  status?: WalletSigningIntentStatus
  transferLogId?: string | null
  signedPayload?: string | null
  txHash?: string | null
  errorCode?: string | null
  errorDetails?: Record<string, unknown> | null
}

type PersistedIntentRow = {
  id: string
  intentType: string
  status: string
  walletId: string
  userId: string | null
  chainId: number
  idempotencyKey: string
  correlationId: string
  transferLogId: string | null
  payload: unknown
  signedPayload: string | null
  txHash: string | null
  errorCode: string | null
  errorDetails: unknown
  createdAt: Date
  updatedAt: Date
}

const globalForWalletSigningIntents = globalThis as unknown as {
  walletSigningIntents?: Map<string, WalletSigningIntentRecord>
}

const memoryIntents = globalForWalletSigningIntents.walletSigningIntents ?? new Map<string, WalletSigningIntentRecord>()
if (!globalForWalletSigningIntents.walletSigningIntents) {
  globalForWalletSigningIntents.walletSigningIntents = memoryIntents
}

function canUsePg() {
  return Boolean(process.env.PG_DATABASE_URL ?? process.env.POSTGRES_URL)
}

function normalizeNullableString(value?: string | null): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

function fromJsonRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function parseWalletSigningIntentPayload(value: unknown): WalletSigningIntentPayload {
  return evmTransactionSigningIntentPayloadSchema.parse(value)
}

function mapWalletSigningIntentRow(row: PersistedIntentRow): WalletSigningIntentRecord {
  return {
    id: row.id,
    intentType: WALLET_SIGNING_INTENT_TYPE_EVM_TRANSACTION,
    status: walletSigningIntentStatusSchema.parse(row.status),
    walletId: row.walletId,
    userId: row.userId,
    chainId: row.chainId,
    idempotencyKey: row.idempotencyKey,
    correlationId: row.correlationId,
    transferLogId: normalizeNullableString(row.transferLogId),
    payload: parseWalletSigningIntentPayload(row.payload),
    signedPayload: normalizeNullableString(row.signedPayload),
    txHash: normalizeNullableString(row.txHash),
    errorCode: normalizeNullableString(row.errorCode),
    errorDetails: fromJsonRecord(row.errorDetails),
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  }
}

function applyWalletSigningIntentUpdates(
  record: WalletSigningIntentRecord,
  updates: UpdateWalletSigningIntentInput,
): WalletSigningIntentRecord {
  return {
    ...record,
    status: updates.status ?? record.status,
    transferLogId:
      updates.transferLogId !== undefined ? normalizeNullableString(updates.transferLogId) : record.transferLogId,
    signedPayload:
      updates.signedPayload !== undefined ? normalizeNullableString(updates.signedPayload) : record.signedPayload,
    txHash: updates.txHash !== undefined ? normalizeNullableString(updates.txHash) : record.txHash,
    errorCode: updates.errorCode !== undefined ? normalizeNullableString(updates.errorCode) : record.errorCode,
    errorDetails:
      updates.errorDetails !== undefined
        ? (updates.errorDetails ? JSON.parse(JSON.stringify(updates.errorDetails)) : null)
        : record.errorDetails,
    updatedAt: Date.now(),
  }
}

function buildPgUpdateData(updates: UpdateWalletSigningIntentInput) {
  return {
    ...(updates.status ? { status: updates.status } : {}),
    ...(updates.transferLogId !== undefined ? { transferLogId: normalizeNullableString(updates.transferLogId) } : {}),
    ...(updates.signedPayload !== undefined ? { signedPayload: normalizeNullableString(updates.signedPayload) } : {}),
    ...(updates.txHash !== undefined ? { txHash: normalizeNullableString(updates.txHash) } : {}),
    ...(updates.errorCode !== undefined ? { errorCode: normalizeNullableString(updates.errorCode) } : {}),
    ...(updates.errorDetails !== undefined
      ? { errorDetails: updates.errorDetails ? toJson(updates.errorDetails) : Prisma.DbNull }
      : {}),
  }
}

export function serializeEvmTransactionRequest(transaction: TransactionRequest): SerializedEvmTransaction {
  return serializedEvmTransactionSchema.parse({
    to: String(transaction.to),
    value:
      transaction.value === undefined || transaction.value === null ? null : transaction.value.toString(),
    nonce:
      transaction.nonce === undefined || transaction.nonce === null ? null : Number(transaction.nonce),
    gasLimit:
      transaction.gasLimit === undefined || transaction.gasLimit === null
        ? null
        : transaction.gasLimit.toString(),
    gasPrice:
      transaction.gasPrice === undefined || transaction.gasPrice === null
        ? null
        : transaction.gasPrice.toString(),
    maxFeePerGas:
      transaction.maxFeePerGas === undefined || transaction.maxFeePerGas === null
        ? null
        : transaction.maxFeePerGas.toString(),
    maxPriorityFeePerGas:
      transaction.maxPriorityFeePerGas === undefined || transaction.maxPriorityFeePerGas === null
        ? null
        : transaction.maxPriorityFeePerGas.toString(),
    data: typeof transaction.data === 'string' ? transaction.data : null,
  })
}

export function buildEvmTransactionSigningIntentPayload(input: {
  walletId: string
  chainId: number
  fromAddress: string
  toAddress: string
  amountWei: string
  txType: ChainTransactionType
  data?: string | null
  transferLogId?: string | null
  transaction: TransactionRequest
}): EvmTransactionSigningIntentPayload {
  return evmTransactionSigningIntentPayloadSchema.parse({
    kind: 'evm-transaction',
    walletId: input.walletId,
    chainId: input.chainId,
    fromAddress: input.fromAddress,
    toAddress: input.toAddress,
    amountWei: input.amountWei,
    txType: input.txType,
    data: input.data ?? null,
    transferLogId: input.transferLogId ?? null,
    transaction: serializeEvmTransactionRequest(input.transaction),
  })
}

export async function createWalletSigningIntent(
  input: CreateWalletSigningIntentInput,
): Promise<WalletSigningIntentRecord> {
  const payload = parseWalletSigningIntentPayload(input.payload)
  const transferLogId = normalizeNullableString(input.transferLogId ?? payload.transferLogId ?? null)

  if (canUsePg()) {
    try {
      const row = await prismaPg.walletSigningIntent.create({
        data: {
          intentType: WALLET_SIGNING_INTENT_TYPE_EVM_TRANSACTION,
          status: 'queued',
          walletId: input.walletId,
          userId: input.userId ?? null,
          chainId: input.chainId,
          idempotencyKey: input.idempotencyKey,
          correlationId: input.correlationId,
          transferLogId,
          payload: toJson(payload),
        },
      })
      return mapWalletSigningIntentRow(row)
    } catch (error: unknown) {
      const err = error as { code?: string } | null
      if (err?.code === 'P2002') {
        throw new Error('SIGNING_INTENT_REPLAY')
      }
      throw error
    }
  }

  const id = `intent_${crypto.randomUUID()}`
  const now = Date.now()
  const record: WalletSigningIntentRecord = {
    id,
    intentType: WALLET_SIGNING_INTENT_TYPE_EVM_TRANSACTION,
    status: 'queued',
    walletId: input.walletId,
    userId: input.userId ?? null,
    chainId: input.chainId,
    idempotencyKey: input.idempotencyKey,
    correlationId: input.correlationId,
    transferLogId,
    payload,
    signedPayload: null,
    txHash: null,
    errorCode: null,
    errorDetails: null,
    createdAt: now,
    updatedAt: now,
  }
  memoryIntents.set(id, record)

  if (isStrictMode && memoryIntents.size > 10_000) {
    const oldest = Array.from(memoryIntents.values()).sort((left, right) => left.createdAt - right.createdAt)[0]
    if (oldest) {
      memoryIntents.delete(oldest.id)
    }
  }

  return record
}

export async function getWalletSigningIntent(intentId: string): Promise<WalletSigningIntentRecord | null> {
  if (canUsePg()) {
    try {
      const row = await prismaPg.walletSigningIntent.findUnique({ where: { id: intentId } })
      return row ? mapWalletSigningIntentRow(row) : null
    } catch (error) {
      if (isStrictMode) throw error
      logWarn('wallet-signing-intent:read', error, { intentId })
    }
  }

  return memoryIntents.get(intentId) ?? null
}

export async function updateWalletSigningIntent(
  intentId: string,
  updates: UpdateWalletSigningIntentInput,
): Promise<WalletSigningIntentRecord | null> {
  if (canUsePg()) {
    try {
      const row = await prismaPg.walletSigningIntent.update({
        where: { id: intentId },
        data: buildPgUpdateData(updates),
      })
      return mapWalletSigningIntentRow(row)
    } catch (error) {
      if (isStrictMode) throw error
      logWarn('wallet-signing-intent:update', error, { intentId })
      return null
    }
  }

  const record = memoryIntents.get(intentId)
  if (!record) return null
  const updated = applyWalletSigningIntentUpdates(record, updates)
  memoryIntents.set(intentId, updated)
  return updated
}

export async function claimNextQueuedWalletSigningIntent(): Promise<WalletSigningIntentRecord | null> {
  if (canUsePg()) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const row = await prismaPg.walletSigningIntent.findFirst({
        where: { status: 'queued' },
        orderBy: { createdAt: 'asc' },
      })
      if (!row) return null

      const claimed = await prismaPg.walletSigningIntent.updateMany({
        where: {
          id: row.id,
          status: 'queued',
        },
        data: {
          status: 'signing',
        },
      })

      if (claimed.count === 1) {
        const claimedRow = await prismaPg.walletSigningIntent.findUnique({
          where: { id: row.id },
        })
        return claimedRow ? mapWalletSigningIntentRow(claimedRow) : null
      }
    }

    return null
  }

  const record = Array.from(memoryIntents.values())
    .filter((intent) => intent.status === 'queued')
    .sort((left, right) => left.createdAt - right.createdAt)[0]
  if (!record) return null

  const claimed = applyWalletSigningIntentUpdates(record, { status: 'signing' })
  memoryIntents.set(record.id, claimed)
  return claimed
}

export async function markWalletSigningIntentSigned(
  intentId: string,
  input: { signedPayload: string; txHash?: string | null },
) {
  return updateWalletSigningIntent(intentId, {
    status: 'signed',
    signedPayload: input.signedPayload,
    txHash: input.txHash ?? null,
    errorCode: null,
    errorDetails: null,
  })
}

export async function markWalletSigningIntentBroadcasted(
  intentId: string,
  input: { signedPayload?: string | null; txHash: string },
) {
  return updateWalletSigningIntent(intentId, {
    status: 'broadcasted',
    signedPayload: input.signedPayload,
    txHash: input.txHash,
    errorCode: null,
    errorDetails: null,
  })
}

export async function markWalletSigningIntentFailed(
  intentId: string,
  input: { errorCode: string; errorDetails?: Record<string, unknown> | null; txHash?: string | null },
) {
  return updateWalletSigningIntent(intentId, {
    status: 'failed',
    errorCode: input.errorCode,
    errorDetails: input.errorDetails ?? null,
    txHash: input.txHash,
  })
}

export function resetWalletSigningIntentState() {
  memoryIntents.clear()
}
