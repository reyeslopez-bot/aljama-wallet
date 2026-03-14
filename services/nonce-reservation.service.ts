import crypto from 'node:crypto'
import type { JsonRpcProvider } from 'ethers'
import { prismaPg } from '@/lib/prisma-pg'

export const NONCE_RESERVATION_STATUSES = [
  'RESERVED',
  'SUBMITTED',
  'CONFIRMED',
  'FAILED',
  'RELEASED',
] as const

export type NonceReservationStatus = (typeof NONCE_RESERVATION_STATUSES)[number]

export type WalletNonceStateRecord = {
  walletId: string
  chainId: number
  nextNonce: number
  createdAt: number
  updatedAt: number
}

export type NonceReservationRecord = {
  id: string
  walletId: string
  chainId: number
  nonce: number
  actionId: string
  status: NonceReservationStatus
  txHash: string | null
  createdAt: number
  updatedAt: number
}

export type ReserveWalletNonceInput = {
  walletId: string
  walletAddress: string
  chainId: number
  actionId: string
  provider: Pick<JsonRpcProvider, 'getTransactionCount'>
  requestedNonce?: number
}

type PersistedNonceReservationRow = {
  id: string
  walletId: string
  chainId: number
  nonce: number
  actionId: string
  status: string
  txHash: string | null
  createdAt: Date
  updatedAt: Date
}

type PersistedWalletNonceStateRow = {
  walletId: string
  chainId: number
  nextNonce: number
  createdAt: Date
  updatedAt: Date
}

const globalForWalletNonceState = globalThis as unknown as {
  walletNonceStates?: Map<string, WalletNonceStateRecord>
  nonceReservations?: Map<string, NonceReservationRecord>
}

const memoryStates = globalForWalletNonceState.walletNonceStates ?? new Map<string, WalletNonceStateRecord>()
const memoryReservations = globalForWalletNonceState.nonceReservations ?? new Map<string, NonceReservationRecord>()

if (!globalForWalletNonceState.walletNonceStates) {
  globalForWalletNonceState.walletNonceStates = memoryStates
}
if (!globalForWalletNonceState.nonceReservations) {
  globalForWalletNonceState.nonceReservations = memoryReservations
}

function canUsePg() {
  return Boolean(process.env.PG_DATABASE_URL ?? process.env.POSTGRES_URL)
}

function stateKey(walletId: string, chainId: number) {
  return `${walletId}:${chainId}`
}

function actionKey(walletId: string, chainId: number, actionId: string) {
  return `${walletId}:${chainId}:${actionId}`
}

function normalizeNullableString(value?: string | null): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function assertNonce(value: number | undefined, errorCode: string) {
  if (
    value === undefined ||
    !Number.isInteger(value) ||
    value < 0 ||
    !Number.isSafeInteger(value)
  ) {
    throw new Error(errorCode)
  }
}

function normalizeReservationStatus(value: string): NonceReservationStatus {
  if ((NONCE_RESERVATION_STATUSES as readonly string[]).includes(value)) {
    return value as NonceReservationStatus
  }
  throw new Error(`Invalid nonce reservation status: ${value}`)
}

function mapNonceStateRow(row: PersistedWalletNonceStateRow): WalletNonceStateRecord {
  return {
    walletId: row.walletId,
    chainId: row.chainId,
    nextNonce: row.nextNonce,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  }
}

function mapNonceReservationRow(row: PersistedNonceReservationRow): NonceReservationRecord {
  return {
    id: row.id,
    walletId: row.walletId,
    chainId: row.chainId,
    nonce: row.nonce,
    actionId: row.actionId,
    status: normalizeReservationStatus(row.status),
    txHash: normalizeNullableString(row.txHash),
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  }
}

async function readChainPendingNonce(
  provider: Pick<JsonRpcProvider, 'getTransactionCount'>,
  walletAddress: string,
): Promise<number> {
  const nonce = await provider.getTransactionCount(walletAddress, 'pending')
  assertNonce(nonce, 'INVALID_CHAIN_NONCE')
  return nonce
}

function findMemoryReservationByAction(
  walletId: string,
  chainId: number,
  actionId: string,
): NonceReservationRecord | null {
  for (const reservation of memoryReservations.values()) {
    if (actionKey(reservation.walletId, reservation.chainId, reservation.actionId) === actionKey(walletId, chainId, actionId)) {
      return reservation
    }
  }
  return null
}

function updateMemoryReservation(
  reservationId: string,
  updates: Partial<Pick<NonceReservationRecord, 'status' | 'txHash'>>,
): NonceReservationRecord | null {
  const existing = memoryReservations.get(reservationId)
  if (!existing) return null

  const updated: NonceReservationRecord = {
    ...existing,
    ...(updates.status ? { status: updates.status } : {}),
    ...(updates.txHash !== undefined ? { txHash: normalizeNullableString(updates.txHash) } : {}),
    updatedAt: Date.now(),
  }
  memoryReservations.set(reservationId, updated)
  return updated
}

async function updateNonceReservationById(
  reservationId: string,
  updates: Partial<Pick<NonceReservationRecord, 'status' | 'txHash'>>,
): Promise<NonceReservationRecord | null> {
  if (canUsePg()) {
    try {
      const row = await prismaPg.nonceReservation.update({
        where: { id: reservationId },
        data: {
          ...(updates.status ? { status: updates.status } : {}),
          ...(updates.txHash !== undefined ? { txHash: normalizeNullableString(updates.txHash) } : {}),
        },
      })

      return mapNonceReservationRow(row)
    } catch (error) {
      const err = error as { code?: string } | null
      if (err?.code === 'P2025') {
        return null
      }
      throw error
    }
  }

  return updateMemoryReservation(reservationId, updates)
}

async function updateNonceReservationsByTxHashes(
  txHashes: string[],
  status: Extract<NonceReservationStatus, 'SUBMITTED' | 'CONFIRMED' | 'FAILED'>,
): Promise<number> {
  const normalizedTxHashes = txHashes
    .map((value) => normalizeNullableString(value))
    .filter((value): value is string => Boolean(value))

  if (normalizedTxHashes.length === 0) return 0

  if (canUsePg()) {
    const result = await prismaPg.nonceReservation.updateMany({
      where: {
        txHash: { in: normalizedTxHashes },
      },
      data: {
        status,
      },
    })
    return result.count
  }

  let updatedCount = 0
  for (const reservation of memoryReservations.values()) {
    if (!reservation.txHash || !normalizedTxHashes.includes(reservation.txHash)) continue
    updateMemoryReservation(reservation.id, { status })
    updatedCount += 1
  }
  return updatedCount
}

export async function reserveWalletNonce(input: ReserveWalletNonceInput): Promise<NonceReservationRecord> {
  if (input.requestedNonce !== undefined) {
    assertNonce(input.requestedNonce, 'INVALID_REQUESTED_NONCE')
  }
  const chainPendingNonce = await readChainPendingNonce(input.provider, input.walletAddress)

  if (canUsePg()) {
    try {
      return await prismaPg.$transaction(async (tx) => {
        await tx.$executeRaw`
          INSERT INTO "WalletNonceState" ("walletId", "chainId", "nextNonce", "createdAt", "updatedAt")
          VALUES (${input.walletId}, ${input.chainId}, ${chainPendingNonce}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT ("walletId", "chainId") DO NOTHING
        `

        const stateRows = await tx.$queryRaw<PersistedWalletNonceStateRow[]>`
          SELECT "walletId", "chainId", "nextNonce", "createdAt", "updatedAt"
          FROM "WalletNonceState"
          WHERE "walletId" = ${input.walletId} AND "chainId" = ${input.chainId}
          FOR UPDATE
        `
        const state = stateRows[0]
        if (!state) {
          throw new Error('NONCE_STATE_MISSING')
        }

        const effectiveNextNonce = Math.max(state.nextNonce, chainPendingNonce)
        let nonce = effectiveNextNonce
        if (input.requestedNonce !== undefined) {
          if (input.requestedNonce < effectiveNextNonce) {
            throw new Error('NONCE_TOO_LOW')
          }
          nonce = input.requestedNonce
        }

        await tx.walletNonceState.update({
          where: {
            walletId_chainId: {
              walletId: input.walletId,
              chainId: input.chainId,
            },
          },
          data: {
            nextNonce: nonce + 1,
          },
        })

        const reservation = await tx.nonceReservation.create({
          data: {
            walletId: input.walletId,
            chainId: input.chainId,
            nonce,
            actionId: input.actionId,
            status: 'RESERVED',
            txHash: null,
          },
        })

        return mapNonceReservationRow(reservation)
      })
    } catch (error) {
      const err = error as { code?: string } | null
      if (err?.code === 'P2002') {
        const existing = await prismaPg.nonceReservation.findFirst({
          where: {
            walletId: input.walletId,
            chainId: input.chainId,
            actionId: input.actionId,
          },
        })
        if (existing) {
          return mapNonceReservationRow(existing)
        }
        throw new Error('NONCE_ALREADY_RESERVED')
      }
      throw error
    }
  }

  const existing = findMemoryReservationByAction(input.walletId, input.chainId, input.actionId)
  if (existing) return existing

  const key = stateKey(input.walletId, input.chainId)
  const current = memoryStates.get(key)
  const baselineNonce = current ? Math.max(current.nextNonce, chainPendingNonce) : chainPendingNonce
  let nonce = baselineNonce
  if (input.requestedNonce !== undefined) {
    if (input.requestedNonce < baselineNonce) {
      throw new Error('NONCE_TOO_LOW')
    }
    nonce = input.requestedNonce
  }

  for (const reservation of memoryReservations.values()) {
    if (reservation.walletId === input.walletId && reservation.chainId === input.chainId && reservation.nonce === nonce) {
      throw new Error('NONCE_ALREADY_RESERVED')
    }
  }

  const now = Date.now()
  memoryStates.set(key, {
    walletId: input.walletId,
    chainId: input.chainId,
    nextNonce: nonce + 1,
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
  })

  const reservation: NonceReservationRecord = {
    id: `nonce_${crypto.randomUUID()}`,
    walletId: input.walletId,
    chainId: input.chainId,
    nonce,
    actionId: input.actionId,
    status: 'RESERVED',
    txHash: null,
    createdAt: now,
    updatedAt: now,
  }
  memoryReservations.set(reservation.id, reservation)
  return reservation
}

export async function getWalletNonceState(
  walletId: string,
  chainId: number,
): Promise<WalletNonceStateRecord | null> {
  if (canUsePg()) {
    const row = await prismaPg.walletNonceState.findUnique({
      where: {
        walletId_chainId: {
          walletId,
          chainId,
        },
      },
    })
    return row ? mapNonceStateRow(row) : null
  }

  return memoryStates.get(stateKey(walletId, chainId)) ?? null
}

export async function getNonceReservation(reservationId: string): Promise<NonceReservationRecord | null> {
  if (canUsePg()) {
    const row = await prismaPg.nonceReservation.findUnique({
      where: {
        id: reservationId,
      },
    })
    return row ? mapNonceReservationRow(row) : null
  }

  return memoryReservations.get(reservationId) ?? null
}

export async function releaseNonceReservation(reservationId: string) {
  return updateNonceReservationById(reservationId, { status: 'RELEASED' })
}

export async function markNonceReservationSubmitted(reservationId: string, txHash: string) {
  const normalizedTxHash = normalizeNullableString(txHash)
  if (!normalizedTxHash) {
    throw new Error('INVALID_TX_HASH')
  }
  return updateNonceReservationById(reservationId, {
    status: 'SUBMITTED',
    txHash: normalizedTxHash,
  })
}

export async function markNonceReservationFailed(reservationId: string) {
  return updateNonceReservationById(reservationId, { status: 'FAILED' })
}

export async function markNonceReservationConfirmedByTxHash(txHash: string) {
  return updateNonceReservationsByTxHashes([txHash], 'CONFIRMED')
}

export async function markNonceReservationFailedByTxHash(txHash: string) {
  return updateNonceReservationsByTxHashes([txHash], 'FAILED')
}

export async function markNonceReservationSubmittedByTxHash(txHash: string) {
  return updateNonceReservationsByTxHashes([txHash], 'SUBMITTED')
}

export async function markNonceReservationsFailedByTxHashes(txHashes: string[]) {
  return updateNonceReservationsByTxHashes(txHashes, 'FAILED')
}

export function resetWalletNonceReservationState() {
  memoryStates.clear()
  memoryReservations.clear()
}
