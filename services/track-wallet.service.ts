import { prismaPg } from '@/lib/prisma-pg'
import { logWarn } from '@/lib/security/logging'

export type TrackWalletEventInput = {
  address: string
  chainId: number | null
  chainName: string | null
  connectorId: string | null
  connectorName: string | null
  connectorType: string | null
  userAgent: string | null
  timestamp: string
  receivedAt: number
}

type StoredEvent = TrackWalletEventInput & { createdAt: number }

const MAX_EVENTS = 200
const memoryEvents: StoredEvent[] = []

function canUsePg() {
  return Boolean(process.env.PG_DATABASE_URL ?? process.env.POSTGRES_URL)
}

export async function recordTrackWalletEvent(input: TrackWalletEventInput) {
  if (canUsePg()) {
    try {
      await prismaPg.trackWalletEvent.create({
        data: {
          address: input.address,
          chainId: input.chainId ?? null,
          chainName: input.chainName ?? null,
          connectorId: input.connectorId ?? null,
          connectorName: input.connectorName ?? null,
          connectorType: input.connectorType ?? null,
          userAgent: input.userAgent ?? null,
          timestamp: new Date(input.timestamp),
          receivedAt: new Date(input.receivedAt),
        },
      })
      return { stored: 'db' as const }
    } catch (error) {
      logWarn('track-wallet', error)
    }
  }

  memoryEvents.push({ ...input, createdAt: Date.now() })
  if (memoryEvents.length > MAX_EVENTS) {
    memoryEvents.splice(0, memoryEvents.length - MAX_EVENTS)
  }
  return { stored: 'memory' as const }
}

export function getTrackWalletEvents() {
  return memoryEvents.slice().reverse()
}
