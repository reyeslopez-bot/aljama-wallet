import { randomUUID } from 'node:crypto'
import { prismaPg } from '@/lib/prisma-pg'
import { logWarn } from '@/lib/security/logging'
import type { Prisma } from '@/prisma/generated/pg'

export type XrplActionKind =
  | 'trustset'
  | 'nft_mint'
  | 'offer_create'
  | 'offer_cancel'
  | 'nft_offer_create'
  | 'nft_offer_accept'
  | 'nft_offer_cancel'

export type XrplActionStatus =
  | 'queued'
  | 'submitted'
  | 'validated'
  | 'review'
  | 'denied'
  | 'failed'

export type XrplActionRecord = {
  id: string
  action: XrplActionKind
  status: XrplActionStatus
  userId: string | null
  networkId: string
  account: string
  idempotencyKey: string
  txHash: string | null
  engineResult: string | null
  details: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

type CreateActionInput = {
  action: XrplActionKind
  status: XrplActionStatus
  userId?: string | null
  networkId: string
  account: string
  idempotencyKey: string
  txHash?: string | null
  engineResult?: string | null
  details?: Record<string, unknown> | null
}

type UpdateActionInput = {
  id: string
  status: XrplActionStatus
  txHash?: string | null
  engineResult?: string | null
  details?: Record<string, unknown> | null
}

const globalForXrplActions = globalThis as unknown as {
  xrplActions?: Map<string, XrplActionRecord>
}

const actions = globalForXrplActions.xrplActions ?? new Map<string, XrplActionRecord>()
if (!globalForXrplActions.xrplActions) {
  globalForXrplActions.xrplActions = actions
}

const MAX_ACTIONS = 2000

function canUsePg() {
  return Boolean(process.env.PG_DATABASE_URL ?? process.env.POSTGRES_URL)
}

function toPayload(record: XrplActionRecord) {
  return {
    ...record,
  }
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

async function persistToTelemetry(event: 'xrpl_action_created' | 'xrpl_action_updated', record: XrplActionRecord) {
  if (!canUsePg()) return
  try {
    await prismaPg.telemetryEvent.create({
      data: {
        event,
        sessionId: record.userId ?? 'system',
        deviceId: `xrpl-${record.networkId}`,
        path: '/api/xrpl',
        payload: toJson(toPayload(record)),
      },
    })
  } catch (error) {
    logWarn('xrpl-action-log:telemetry', error)
  }
}

function trimIfNeeded() {
  if (actions.size <= MAX_ACTIONS) return
  const sorted = Array.from(actions.values()).sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt))
  const prune = sorted.slice(0, Math.max(0, sorted.length - MAX_ACTIONS))
  for (const item of prune) {
    actions.delete(item.id)
  }
}

export async function createXrplAction(input: CreateActionInput): Promise<XrplActionRecord> {
  const now = new Date().toISOString()
  const record: XrplActionRecord = {
    id: randomUUID(),
    action: input.action,
    status: input.status,
    userId: input.userId ?? null,
    networkId: input.networkId,
    account: input.account,
    idempotencyKey: input.idempotencyKey,
    txHash: input.txHash ?? null,
    engineResult: input.engineResult ?? null,
    details: input.details ?? null,
    createdAt: now,
    updatedAt: now,
  }
  actions.set(record.id, record)
  trimIfNeeded()
  await persistToTelemetry('xrpl_action_created', record)
  return record
}

export async function updateXrplAction(input: UpdateActionInput): Promise<XrplActionRecord | null> {
  const current = actions.get(input.id)
  if (!current) return null
  const updated: XrplActionRecord = {
    ...current,
    status: input.status,
    txHash: input.txHash ?? current.txHash,
    engineResult: input.engineResult ?? current.engineResult,
    details: input.details ?? current.details,
    updatedAt: new Date().toISOString(),
  }
  actions.set(updated.id, updated)
  await persistToTelemetry('xrpl_action_updated', updated)
  return updated
}

export async function listXrplActions(params?: {
  limit?: number
  networkId?: string | null
}): Promise<XrplActionRecord[]> {
  const limit = Math.min(Math.max(params?.limit ?? 20, 1), 200)
  const networkId = params?.networkId?.trim() || null

  let records = Array.from(actions.values())
  if (networkId) {
    records = records.filter((item) => item.networkId === networkId)
  }

  records.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
  return records.slice(0, limit)
}
