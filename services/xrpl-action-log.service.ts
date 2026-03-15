import { randomUUID } from 'node:crypto'
import { prismaPg } from '@/lib/prisma-pg'
import { logWarn } from '@/lib/security/logging'
import type { Prisma } from '@/prisma/generated/pg'
import { runForensicRetentionMaintenance } from '@/services/forensic-retention.service'

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
  traceId: string
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
  traceId: string
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

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

function fromJsonRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function toPayload(record: XrplActionRecord) {
  return {
    ...record,
  }
}

async function persistToTelemetry(event: 'xrpl_action_created' | 'xrpl_action_updated', record: XrplActionRecord) {
  if (!canUsePg()) return
  try {
    await prismaPg.telemetryEvent.create({
      data: {
        schemaVersion: '1',
        event,
        sessionId: record.userId ?? 'system',
        deviceId: `xrpl-${record.networkId}`,
        traceId: record.traceId,
        path: '/api/xrpl',
        payload: toJson(toPayload(record)),
      },
    })
  } catch (error) {
    logWarn('xrpl-action-log:telemetry', error)
  }
}

function cacheAction(record: XrplActionRecord) {
  actions.set(record.id, record)
  if (actions.size <= MAX_ACTIONS) return
  const sorted = Array.from(actions.values()).sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt))
  const prune = sorted.slice(0, Math.max(0, sorted.length - MAX_ACTIONS))
  for (const item of prune) {
    actions.delete(item.id)
  }
}

async function persistActionCreatedToDb(record: XrplActionRecord) {
  if (!canUsePg()) return
  try {
    await prismaPg.$transaction([
      prismaPg.xrplAction.create({
        data: {
          id: record.id,
          action: record.action,
          status: record.status,
          userId: record.userId,
          networkId: record.networkId,
          account: record.account,
          idempotencyKey: record.idempotencyKey,
          traceId: record.traceId,
          txHash: record.txHash,
          engineResult: record.engineResult,
          details: record.details ? toJson(record.details) : undefined,
          createdAt: new Date(record.createdAt),
          updatedAt: new Date(record.updatedAt),
        },
      }),
      prismaPg.xrplActionEvent.create({
        data: {
          actionId: record.id,
          eventType: 'created',
          status: record.status,
          txHash: record.txHash,
          engineResult: record.engineResult,
          details: record.details ? toJson(record.details) : undefined,
        },
      }),
    ])
    void runForensicRetentionMaintenance()
  } catch (error) {
    logWarn('xrpl-action-log:db-create', error, { actionId: record.id, traceId: record.traceId })
  }
}

async function persistActionUpdatedToDb(record: XrplActionRecord) {
  if (!canUsePg()) return
  try {
    await prismaPg.$transaction([
      prismaPg.xrplAction.update({
        where: {
          id: record.id,
        },
        data: {
          status: record.status,
          txHash: record.txHash,
          engineResult: record.engineResult,
          details: record.details ? toJson(record.details) : undefined,
          updatedAt: new Date(record.updatedAt),
        },
      }),
      prismaPg.xrplActionEvent.create({
        data: {
          actionId: record.id,
          eventType: 'updated',
          status: record.status,
          txHash: record.txHash,
          engineResult: record.engineResult,
          details: record.details ? toJson(record.details) : undefined,
        },
      }),
    ])
    void runForensicRetentionMaintenance()
  } catch (error) {
    logWarn('xrpl-action-log:db-update', error, { actionId: record.id, traceId: record.traceId })
  }
}

function rowToActionRecord(row: {
  id: string
  action: string
  status: string
  userId: string | null
  networkId: string
  account: string
  idempotencyKey: string
  traceId: string
  txHash: string | null
  engineResult: string | null
  details: unknown
  createdAt: Date
  updatedAt: Date
}): XrplActionRecord {
  return {
    id: row.id,
    action: row.action as XrplActionKind,
    status: row.status as XrplActionStatus,
    userId: row.userId,
    networkId: row.networkId,
    account: row.account,
    idempotencyKey: row.idempotencyKey,
    traceId: row.traceId,
    txHash: row.txHash,
    engineResult: row.engineResult,
    details: fromJsonRecord(row.details),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

async function getXrplActionFromDb(id: string): Promise<XrplActionRecord | null> {
  if (!canUsePg()) return null

  try {
    const row = await prismaPg.xrplAction.findUnique({
      where: {
        id,
      },
    })
    if (!row) return null
    const record = rowToActionRecord(row)
    cacheAction(record)
    return record
  } catch (error) {
    logWarn('xrpl-action-log:db-find', error, { actionId: id })
    return null
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
    traceId: input.traceId,
    txHash: input.txHash ?? null,
    engineResult: input.engineResult ?? null,
    details: input.details ?? null,
    createdAt: now,
    updatedAt: now,
  }
  cacheAction(record)

  await Promise.all([
    persistActionCreatedToDb(record),
    persistToTelemetry('xrpl_action_created', record),
  ])

  return record
}

export async function updateXrplAction(input: UpdateActionInput): Promise<XrplActionRecord | null> {
  let current = actions.get(input.id) ?? null
  if (!current) {
    current = await getXrplActionFromDb(input.id)
  }
  if (!current) return null

  const updated: XrplActionRecord = {
    ...current,
    status: input.status,
    txHash: input.txHash ?? current.txHash,
    engineResult: input.engineResult ?? current.engineResult,
    details: input.details ?? current.details,
    updatedAt: new Date().toISOString(),
  }
  cacheAction(updated)

  await Promise.all([
    persistActionUpdatedToDb(updated),
    persistToTelemetry('xrpl_action_updated', updated),
  ])

  return updated
}

function listFromMemory(params: { limit: number; networkId: string | null }): XrplActionRecord[] {
  const { limit, networkId } = params
  let records = Array.from(actions.values())
  if (networkId) {
    records = records.filter((item) => item.networkId === networkId)
  }
  records.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
  return records.slice(0, limit)
}

export async function listXrplActions(params?: {
  limit?: number
  networkId?: string | null
}): Promise<XrplActionRecord[]> {
  const limit = Math.min(Math.max(params?.limit ?? 20, 1), 200)
  const networkId = params?.networkId?.trim() || null

  if (canUsePg()) {
    try {
      const rows = await prismaPg.xrplAction.findMany({
        where: networkId
          ? {
              networkId,
            }
          : undefined,
        orderBy: {
          updatedAt: 'desc',
        },
        take: limit,
      })
      if (rows.length > 0) {
        const records = rows.map((row) => rowToActionRecord(row))
        for (const item of records) {
          cacheAction(item)
        }
        return records
      }
    } catch (error) {
      logWarn('xrpl-action-log:db-list', error, { networkId, limit })
    }
  }

  return listFromMemory({ limit, networkId })
}
