import crypto from 'node:crypto'
import type { TransactionRequest } from 'ethers'
import { z } from 'zod'
import { CHAIN_TRANSACTION_TYPES, type ChainTransactionType } from '@/lib/chain-transactions'
import { prismaPg } from '@/lib/prisma-pg'
import {
  archiveWalletSigningIntentPayload,
  measureWalletSigningIntentPayloadBytes,
  readWalletSigningIntentPayload,
  resolveWalletSigningIntentPayloadArchivePolicy,
} from '@/lib/storage/wallet-signing-intent-payload'
import { logWarn } from '@/lib/security/logging'
import { isStrictMode } from '@/lib/security/runtime'
import { Prisma } from '@/prisma/generated/pg'

export const WALLET_SIGNING_INTENT_STATUSES = [
  'queued',
  'approved',
  'signed',
  'submitted',
  'confirmed',
  'failed',
] as const

export const WALLET_SIGNING_INTENT_CHAINS = ['EVM', 'XRPL'] as const

export type WalletSigningIntentStatus = (typeof WALLET_SIGNING_INTENT_STATUSES)[number]
export type WalletSigningIntentChain = (typeof WALLET_SIGNING_INTENT_CHAINS)[number]

const walletSigningIntentStatusSchema = z.enum(WALLET_SIGNING_INTENT_STATUSES)
const walletSigningIntentChainSchema = z.enum(WALLET_SIGNING_INTENT_CHAINS)

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
  nonceReservationId: z.string().min(1).optional().nullable(),
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
export type WalletSigningIntentPayloadStorage = 'inline' | 'archived'

export type WalletSigningIntentRecord = {
  id: string
  chain: WalletSigningIntentChain
  actionType: string
  status: WalletSigningIntentStatus
  walletId: string
  userId: string | null
  chainId: number
  idempotencyKey: string
  traceId: string
  correlationId: string
  transferLogId: string | null
  payload: WalletSigningIntentPayload
  payloadRef: string | null
  payloadStorage: WalletSigningIntentPayloadStorage
  payloadSizeBytes: number
  signedPayload: string | null
  txHash: string | null
  errorCode: string | null
  errorDetails: Record<string, unknown> | null
  createdAt: number
  updatedAt: number
}

type StoredWalletSigningIntentRecord = Omit<WalletSigningIntentRecord, 'payload'> & {
  payload: WalletSigningIntentPayload | null
}

export type CreateWalletSigningIntentInput = {
  walletId: string
  userId?: string | null
  chainId: number
  chain?: WalletSigningIntentChain
  actionType?: string
  idempotencyKey: string
  traceId?: string
  correlationId?: string
  transferLogId?: string | null
  payload?: WalletSigningIntentPayload
  txPayload?: WalletSigningIntentPayload
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
  chain: string
  actionType: string
  status: string
  walletId: string
  userId: string | null
  chainId: number
  idempotencyKey: string
  traceId: string
  transferLogId: string | null
  txPayload: unknown
  txPayloadRef: string | null
  txPayloadSizeBytes: number | null
  signedPayload: string | null
  txHash: string | null
  errorCode: string | null
  errorDetails: unknown
  createdAt: Date
  updatedAt: Date
}

type ResolvedWalletSigningIntentPayload = {
  payload: WalletSigningIntentPayload
  payloadRef: string | null
  payloadStorage: WalletSigningIntentPayloadStorage
  payloadSizeBytes: number
}

type PreparedWalletSigningIntentPayload = ResolvedWalletSigningIntentPayload & {
  inlinePayload: WalletSigningIntentPayload | null
}

const globalForWalletSigningIntents = globalThis as unknown as {
  walletSigningIntents?: Map<string, StoredWalletSigningIntentRecord>
}

const memoryIntents =
  globalForWalletSigningIntents.walletSigningIntents ?? new Map<string, StoredWalletSigningIntentRecord>()
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

function normalizeWalletSigningIntentChain(value?: string | null): WalletSigningIntentChain {
  return walletSigningIntentChainSchema.parse(value ?? 'EVM')
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

function resolvePayloadSizeBytes(payloadSizeBytes: number | null | undefined, payload: WalletSigningIntentPayload): number {
  if (typeof payloadSizeBytes === 'number' && Number.isFinite(payloadSizeBytes) && payloadSizeBytes >= 0) {
    return Math.floor(payloadSizeBytes)
  }

  return measureWalletSigningIntentPayloadBytes(payload)
}

function shouldArchiveWalletSigningIntentPayload(input: { payloadSizeBytes: number; createdAtMs: number; nowMs?: number }) {
  const policy = resolveWalletSigningIntentPayloadArchivePolicy()
  if (input.payloadSizeBytes > policy.inlineMaxBytes) {
    return true
  }

  if (policy.hotWindowMs <= 0) {
    return true
  }

  return (input.nowMs ?? Date.now()) - input.createdAtMs > policy.hotWindowMs
}

function buildWalletSigningIntentRecord(
  base: {
    id: string
    chain: string | WalletSigningIntentChain
    actionType: string
    status: string | WalletSigningIntentStatus
    walletId: string
    userId: string | null
    chainId: number
    idempotencyKey: string
    traceId: string
    transferLogId: string | null
    signedPayload: string | null
    txHash: string | null
    errorCode: string | null
    errorDetails: unknown
    createdAt: Date | number
    updatedAt: Date | number
  },
  payloadState: ResolvedWalletSigningIntentPayload,
): WalletSigningIntentRecord {
  const traceId = base.traceId

  return {
    id: base.id,
    chain: normalizeWalletSigningIntentChain(base.chain),
    actionType: normalizeNullableString(base.actionType) ?? 'transfer',
    status: walletSigningIntentStatusSchema.parse(base.status),
    walletId: base.walletId,
    userId: base.userId,
    chainId: base.chainId,
    idempotencyKey: base.idempotencyKey,
    traceId,
    correlationId: traceId,
    transferLogId: normalizeNullableString(base.transferLogId),
    payload: payloadState.payload,
    payloadRef: normalizeNullableString(payloadState.payloadRef),
    payloadStorage: payloadState.payloadStorage,
    payloadSizeBytes: payloadState.payloadSizeBytes,
    signedPayload: normalizeNullableString(base.signedPayload),
    txHash: normalizeNullableString(base.txHash),
    errorCode: normalizeNullableString(base.errorCode),
    errorDetails: fromJsonRecord(base.errorDetails),
    createdAt: base.createdAt instanceof Date ? base.createdAt.getTime() : base.createdAt,
    updatedAt: base.updatedAt instanceof Date ? base.updatedAt.getTime() : base.updatedAt,
  }
}

async function loadWalletSigningIntentPayload(payloadRef: string): Promise<WalletSigningIntentPayload> {
  return parseWalletSigningIntentPayload(await readWalletSigningIntentPayload<unknown>(payloadRef))
}

async function prepareWalletSigningIntentPayloadPersistence(input: {
  walletId: string
  chainId: number
  idempotencyKey: string
  actionType: string
  payload: WalletSigningIntentPayload
  createdAtMs: number
}): Promise<PreparedWalletSigningIntentPayload> {
  const payloadSizeBytes = measureWalletSigningIntentPayloadBytes(input.payload)
  if (!shouldArchiveWalletSigningIntentPayload({ payloadSizeBytes, createdAtMs: input.createdAtMs })) {
    return {
      payload: input.payload,
      inlinePayload: input.payload,
      payloadRef: null,
      payloadStorage: 'inline',
      payloadSizeBytes,
    }
  }

  const { payloadRef } = await archiveWalletSigningIntentPayload({
    walletId: input.walletId,
    chainId: input.chainId,
    idempotencyKey: input.idempotencyKey,
    actionType: input.actionType,
    payload: input.payload,
  })

  return {
    payload: input.payload,
    inlinePayload: null,
    payloadRef,
    payloadStorage: 'archived',
    payloadSizeBytes,
  }
}

async function archivePersistedWalletSigningIntentRow(
  row: PersistedIntentRow,
  payload: WalletSigningIntentPayload,
  payloadSizeBytes: number,
): Promise<WalletSigningIntentRecord | null> {
  try {
    const { payloadRef } = await archiveWalletSigningIntentPayload({
      walletId: row.walletId,
      chainId: row.chainId,
      idempotencyKey: row.idempotencyKey,
      actionType: row.actionType,
      payload,
    })

    const result = await prismaPg.walletSigningIntent.updateMany({
      where: {
        id: row.id,
        txPayloadRef: null,
      },
      data: {
        txPayload: Prisma.DbNull,
        txPayloadRef: payloadRef,
        txPayloadSizeBytes: payloadSizeBytes,
      },
    })

    if (result.count !== 1) {
      const refreshed = await prismaPg.walletSigningIntent.findUnique({ where: { id: row.id } })
      return refreshed ? materializeWalletSigningIntentRow(refreshed) : null
    }

    return buildWalletSigningIntentRecord(row, {
      payload,
      payloadRef,
      payloadStorage: 'archived',
      payloadSizeBytes,
    })
  } catch (error) {
    if (isStrictMode) throw error
    logWarn('wallet-signing-intent:payload-archive', error, { intentId: row.id })
    return null
  }
}

async function materializeWalletSigningIntentRow(row: PersistedIntentRow): Promise<WalletSigningIntentRecord> {
  const inlinePayload = row.txPayload === null || row.txPayload === undefined ? null : parseWalletSigningIntentPayload(row.txPayload)
  const payloadRef = normalizeNullableString(row.txPayloadRef)

  if (inlinePayload) {
    const payloadSizeBytes = resolvePayloadSizeBytes(row.txPayloadSizeBytes, inlinePayload)
    if (!payloadRef && shouldArchiveWalletSigningIntentPayload({ payloadSizeBytes, createdAtMs: row.createdAt.getTime() })) {
      const archived = await archivePersistedWalletSigningIntentRow(row, inlinePayload, payloadSizeBytes)
      if (archived) {
        return archived
      }
    }

    return buildWalletSigningIntentRecord(row, {
      payload: inlinePayload,
      payloadRef: null,
      payloadStorage: 'inline',
      payloadSizeBytes,
    })
  }

  if (!payloadRef) {
    throw new Error('SIGNING_INTENT_PAYLOAD_MISSING')
  }

  const payload = await loadWalletSigningIntentPayload(payloadRef)
  return buildWalletSigningIntentRecord(row, {
    payload,
    payloadRef,
    payloadStorage: 'archived',
    payloadSizeBytes: resolvePayloadSizeBytes(row.txPayloadSizeBytes, payload),
  })
}

function resolveCreatePayload(input: CreateWalletSigningIntentInput): WalletSigningIntentPayload {
  const rawPayload = input.txPayload ?? input.payload
  if (!rawPayload) {
    throw new Error('SIGNING_INTENT_PAYLOAD_REQUIRED')
  }
  return parseWalletSigningIntentPayload(rawPayload)
}

function resolveTraceId(input: CreateWalletSigningIntentInput): string {
  const traceId = normalizeNullableString(input.traceId ?? input.correlationId)
  if (!traceId) {
    throw new Error('SIGNING_INTENT_TRACE_ID_REQUIRED')
  }
  return traceId
}

function resolveActionType(input: CreateWalletSigningIntentInput, payload: WalletSigningIntentPayload): string {
  return normalizeNullableString(input.actionType ?? payload.txType) ?? payload.txType
}

function applyWalletSigningIntentUpdates(
  record: StoredWalletSigningIntentRecord,
  updates: UpdateWalletSigningIntentInput,
): StoredWalletSigningIntentRecord {
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

async function maybeArchiveStoredWalletSigningIntentRecord(
  record: StoredWalletSigningIntentRecord,
): Promise<StoredWalletSigningIntentRecord> {
  if (!record.payload) {
    return record
  }

  if (!shouldArchiveWalletSigningIntentPayload({ payloadSizeBytes: record.payloadSizeBytes, createdAtMs: record.createdAt })) {
    return record
  }

  try {
    const { payloadRef } = await archiveWalletSigningIntentPayload({
      walletId: record.walletId,
      chainId: record.chainId,
      idempotencyKey: record.idempotencyKey,
      actionType: record.actionType,
      payload: record.payload,
    })

    const archivedRecord: StoredWalletSigningIntentRecord = {
      ...record,
      payload: null,
      payloadRef,
      payloadStorage: 'archived',
    }
    memoryIntents.set(record.id, archivedRecord)
    return archivedRecord
  } catch (error) {
    if (isStrictMode) throw error
    logWarn('wallet-signing-intent:payload-archive', error, { intentId: record.id })
    return record
  }
}

async function materializeStoredWalletSigningIntentRecord(
  record: StoredWalletSigningIntentRecord,
): Promise<WalletSigningIntentRecord> {
  const resolvedRecord = await maybeArchiveStoredWalletSigningIntentRecord(record)
  let payload = resolvedRecord.payload

  if (!payload) {
    const payloadRef = normalizeNullableString(resolvedRecord.payloadRef)
    if (!payloadRef) {
      throw new Error('SIGNING_INTENT_PAYLOAD_MISSING')
    }
    payload = await loadWalletSigningIntentPayload(payloadRef)
  }

  return buildWalletSigningIntentRecord(resolvedRecord, {
    payload,
    payloadRef: resolvedRecord.payloadRef,
    payloadStorage: resolvedRecord.payloadStorage,
    payloadSizeBytes: resolvedRecord.payloadSizeBytes,
  })
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
  nonceReservationId?: string | null
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
    nonceReservationId: input.nonceReservationId ?? null,
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
  const payload = resolveCreatePayload(input)
  const transferLogId = normalizeNullableString(input.transferLogId ?? payload.transferLogId ?? null)
  const traceId = resolveTraceId(input)
  const actionType = resolveActionType(input, payload)
  const chain = normalizeWalletSigningIntentChain(input.chain)
  const now = Date.now()
  const preparedPayload = await prepareWalletSigningIntentPayloadPersistence({
    walletId: input.walletId,
    chainId: input.chainId,
    idempotencyKey: input.idempotencyKey,
    actionType,
    payload,
    createdAtMs: now,
  })

  if (canUsePg()) {
    try {
      const row = await prismaPg.walletSigningIntent.create({
        data: {
          chain,
          actionType,
          status: 'queued',
          walletId: input.walletId,
          userId: input.userId ?? null,
          chainId: input.chainId,
          idempotencyKey: input.idempotencyKey,
          traceId,
          transferLogId,
          txPayload: preparedPayload.inlinePayload ? toJson(preparedPayload.inlinePayload) : Prisma.DbNull,
          txPayloadRef: preparedPayload.payloadRef,
          txPayloadSizeBytes: preparedPayload.payloadSizeBytes,
        },
      })
      return buildWalletSigningIntentRecord(row, preparedPayload)
    } catch (error: unknown) {
      const err = error as { code?: string } | null
      if (err?.code === 'P2002') {
        throw new Error('SIGNING_INTENT_REPLAY')
      }
      throw error
    }
  }

  const id = `intent_${crypto.randomUUID()}`
  const record: StoredWalletSigningIntentRecord = {
    id,
    chain,
    actionType,
    status: 'queued',
    walletId: input.walletId,
    userId: input.userId ?? null,
    chainId: input.chainId,
    idempotencyKey: input.idempotencyKey,
    traceId,
    correlationId: traceId,
    transferLogId,
    payload: preparedPayload.inlinePayload,
    payloadRef: preparedPayload.payloadRef,
    payloadStorage: preparedPayload.payloadStorage,
    payloadSizeBytes: preparedPayload.payloadSizeBytes,
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

  return buildWalletSigningIntentRecord(record, preparedPayload)
}

export async function getWalletSigningIntent(intentId: string): Promise<WalletSigningIntentRecord | null> {
  if (canUsePg()) {
    try {
      const row = await prismaPg.walletSigningIntent.findUnique({ where: { id: intentId } })
      return row ? await materializeWalletSigningIntentRow(row) : null
    } catch (error) {
      if (isStrictMode) throw error
      logWarn('wallet-signing-intent:read', error, { intentId })
    }
  }

  const record = memoryIntents.get(intentId)
  return record ? materializeStoredWalletSigningIntentRecord(record) : null
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
      return materializeWalletSigningIntentRow(row)
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
  return materializeStoredWalletSigningIntentRecord(updated)
}

export async function updateWalletSigningIntentByTxHash(
  txHash: string,
  updates: UpdateWalletSigningIntentInput,
): Promise<number> {
  const normalizedTxHash = normalizeNullableString(txHash)
  if (!normalizedTxHash) return 0

  if (canUsePg()) {
    try {
      const result = await prismaPg.walletSigningIntent.updateMany({
        where: { txHash: normalizedTxHash },
        data: buildPgUpdateData(updates),
      })
      return result.count
    } catch (error) {
      if (isStrictMode) throw error
      logWarn('wallet-signing-intent:update-by-txhash', error, { txHash: normalizedTxHash })
      return 0
    }
  }

  let updatedCount = 0
  for (const [intentId, record] of memoryIntents.entries()) {
    if (record.txHash !== normalizedTxHash) continue
    memoryIntents.set(intentId, applyWalletSigningIntentUpdates(record, updates))
    updatedCount += 1
  }

  return updatedCount
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
          status: 'approved',
        },
      })

      if (claimed.count === 1) {
        const claimedRow = await prismaPg.walletSigningIntent.findUnique({
          where: { id: row.id },
        })
        return claimedRow ? materializeWalletSigningIntentRow(claimedRow) : null
      }
    }

    return null
  }

  const record = Array.from(memoryIntents.values())
    .filter((intent) => intent.status === 'queued')
    .sort((left, right) => left.createdAt - right.createdAt)[0]
  if (!record) return null

  const claimed = applyWalletSigningIntentUpdates(record, { status: 'approved' })
  memoryIntents.set(record.id, claimed)
  return materializeStoredWalletSigningIntentRecord(claimed)
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

export async function markWalletSigningIntentSubmitted(
  intentId: string,
  input: { signedPayload?: string | null; txHash: string },
) {
  return updateWalletSigningIntent(intentId, {
    status: 'submitted',
    signedPayload: input.signedPayload,
    txHash: input.txHash,
    errorCode: null,
    errorDetails: null,
  })
}

export async function markWalletSigningIntentBroadcasted(
  intentId: string,
  input: { signedPayload?: string | null; txHash: string },
) {
  return markWalletSigningIntentSubmitted(intentId, input)
}

export async function markWalletSigningIntentConfirmedByTxHash(txHash: string) {
  return updateWalletSigningIntentByTxHash(txHash, {
    status: 'confirmed',
    errorCode: null,
    errorDetails: null,
  })
}

export async function reopenWalletSigningIntentByTxHash(txHash: string) {
  return updateWalletSigningIntentByTxHash(txHash, {
    status: 'submitted',
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

export async function markWalletSigningIntentFailedByTxHash(
  txHash: string,
  input: { errorCode: string; errorDetails?: Record<string, unknown> | null },
) {
  return updateWalletSigningIntentByTxHash(txHash, {
    status: 'failed',
    errorCode: input.errorCode,
    errorDetails: input.errorDetails ?? null,
  })
}

export function resetWalletSigningIntentState() {
  memoryIntents.clear()
}
