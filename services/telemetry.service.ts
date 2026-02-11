// services/telemetry.service.ts
import { prismaPg } from '@/lib/prisma-pg'
import type { Prisma } from '@/prisma/generated/pg'

export type TelemetryEventInput = {
  event: string
  sessionId: string
  deviceId: string
  path?: string | null
  context?: Record<string, unknown> | null
  payload?: Record<string, unknown> | null
}

export type TelemetryEventStored = TelemetryEventInput & { createdAt: number }

const MAX_EVENTS = 500
const events: TelemetryEventStored[] = []

function canUsePg() {
  return Boolean(process.env.PG_DATABASE_URL ?? process.env.POSTGRES_URL)
}

function toJsonValue(value?: Record<string, unknown> | null): Prisma.InputJsonValue | undefined {
  if (!value) return undefined
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

export async function recordTelemetryEvent(input: TelemetryEventInput) {
  if (canUsePg()) {
    try {
      await prismaPg.telemetryEvent.create({
        data: {
          event: input.event,
          sessionId: input.sessionId,
          deviceId: input.deviceId,
          path: input.path ?? null,
          context: toJsonValue(input.context),
          payload: toJsonValue(input.payload),
        },
      })
      return { stored: 'db' as const }
    } catch (error) {
      // fall through to in-memory for dev
      console.warn('telemetry db write failed, falling back to memory', error)
    }
  }

  events.push({ ...input, createdAt: Date.now() })
  if (events.length > MAX_EVENTS) {
    events.splice(0, events.length - MAX_EVENTS)
  }
  return { stored: 'memory' as const }
}

export function getTelemetryEvents() {
  return events.slice().reverse()
}
