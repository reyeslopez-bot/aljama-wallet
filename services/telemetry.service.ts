import { prismaPg } from '@/lib/prisma-pg'
import type { Prisma } from '@/prisma/generated/pg'
import { assertNoSensitiveFreeFormFields } from '@/lib/security/event-schema'
import { logWarn } from '@/lib/security/logging'
import { createTraceId } from '@/lib/security/trace'

export type TelemetryEventInput = {
  schemaVersion?: string | null
  event: string
  sessionId: string
  deviceId: string
  traceId?: string | null
  path?: string | null
  context?: Record<string, unknown> | null
  payload?: Record<string, unknown> | null
}

export type TelemetryEventStored = Omit<TelemetryEventInput, 'schemaVersion' | 'traceId'> & {
  schemaVersion: string
  traceId: string
  createdAt: number
}

const MAX_EVENTS = 500
const DEFAULT_DB_TIMEOUT_MS = 1_200
const DEFAULT_DB_BACKOFF_MS = 30_000
const events: TelemetryEventStored[] = []
let dbBackoffUntil = 0

class TelemetryPersistenceTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`Telemetry database write timed out after ${timeoutMs}ms`)
    this.name = 'TelemetryPersistenceTimeoutError'
  }
}

function canUsePg() {
  return Boolean(process.env.PG_DATABASE_URL ?? process.env.POSTGRES_URL)
}

function resolveTelemetryStorageMode(): 'db' | 'memory' {
  const explicit = (process.env.TELEMETRY_STORAGE_MODE ?? '').trim().toLowerCase()
  if (explicit === 'db') return 'db'
  if (explicit === 'memory') return 'memory'

  if (process.env.NODE_ENV === 'development') {
    return 'memory'
  }

  return 'db'
}

function toJsonValue(value?: Record<string, unknown> | null): Prisma.InputJsonValue | undefined {
  if (!value) return undefined
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

function normalizeString(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function resolveDbTimeoutMs() {
  const candidate = Number(process.env.TELEMETRY_DB_TIMEOUT_MS)
  if (Number.isFinite(candidate) && candidate > 0) {
    return Math.floor(candidate)
  }
  return DEFAULT_DB_TIMEOUT_MS
}

function resolveDbBackoffMs() {
  const candidate = Number(process.env.TELEMETRY_DB_BACKOFF_MS)
  if (Number.isFinite(candidate) && candidate > 0) {
    return Math.floor(candidate)
  }
  return DEFAULT_DB_BACKOFF_MS
}

async function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null

  try {
    return await Promise.race([
      work,
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new TelemetryPersistenceTimeoutError(timeoutMs)), timeoutMs)
      }),
    ])
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle)
    }
  }
}

export async function recordTelemetryEvent(input: TelemetryEventInput) {
  assertNoSensitiveFreeFormFields('context', input.context)
  assertNoSensitiveFreeFormFields('payload', input.payload)

  const normalized = {
    ...input,
    schemaVersion: normalizeString(input.schemaVersion) ?? '1',
    traceId: normalizeString(input.traceId) ?? createTraceId('telemetry'),
  }
  const timeoutMs = resolveDbTimeoutMs()
  const storageMode = resolveTelemetryStorageMode()

  if (storageMode === 'db' && canUsePg() && Date.now() >= dbBackoffUntil) {
    try {
      await withTimeout(
        prismaPg.telemetryEvent.create({
          data: {
            schemaVersion: normalized.schemaVersion,
            event: normalized.event,
            sessionId: normalized.sessionId,
            deviceId: normalized.deviceId,
            traceId: normalized.traceId,
            path: normalized.path ?? null,
            context: toJsonValue(normalized.context),
            payload: toJsonValue(normalized.payload),
          },
        }),
        timeoutMs,
      )
      dbBackoffUntil = 0
      return { stored: 'db' as const }
    } catch (error) {
      dbBackoffUntil = Date.now() + resolveDbBackoffMs()
      logWarn('telemetry', error, {
        event: normalized.event,
        sessionId: normalized.sessionId,
        deviceId: normalized.deviceId,
        traceId: normalized.traceId,
        schemaVersion: normalized.schemaVersion,
        path: normalized.path ?? null,
        storage: 'db',
        fallback: 'memory',
        fallbackReason:
          error instanceof TelemetryPersistenceTimeoutError ? 'db_timeout' : 'db_error',
        timeoutMs,
        backoffUntil: new Date(dbBackoffUntil).toISOString(),
      })
    }
  }

  events.push({ ...normalized, createdAt: Date.now() })
  if (events.length > MAX_EVENTS) {
    events.splice(0, events.length - MAX_EVENTS)
  }
  return { stored: 'memory' as const }
}

export function getTelemetryEvents() {
  return events.slice().reverse()
}
