import { prismaPg } from '@/lib/prisma-pg'
import { isStrictMode } from '@/lib/security/runtime'

const globalForIdempotency = globalThis as unknown as {
  idempotencyKeys?: Map<string, number>
}

const memoryKeys = globalForIdempotency.idempotencyKeys ?? new Map<string, number>()
if (!globalForIdempotency.idempotencyKeys) {
  globalForIdempotency.idempotencyKeys = memoryKeys
}

const DEFAULT_TTL_MS = 10 * 60 * 1000

function canUsePg() {
  return Boolean(process.env.PG_DATABASE_URL ?? process.env.POSTGRES_URL)
}

function nowMs() {
  return Date.now()
}

export async function reserveIdempotencyKey(params: {
  scope: string
  key: string
  ttlMs?: number
}) {
  const ttlMs = params.ttlMs ?? DEFAULT_TTL_MS
  const expiresAt = new Date(nowMs() + ttlMs)

  if (canUsePg()) {
    try {
      await prismaPg.idempotencyKey.create({
        data: {
          scope: params.scope,
          key: params.key,
          expiresAt,
        },
      })
      return
    } catch (error: unknown) {
      const err = error as { code?: string } | null
      if (err?.code !== 'P2002') throw error

      const existing = await prismaPg.idempotencyKey.findUnique({
        where: {
          scope_key: {
            scope: params.scope,
            key: params.key,
          },
        },
        select: { id: true, expiresAt: true },
      })

      if (!existing) throw error

      if (existing.expiresAt <= new Date()) {
        await prismaPg.idempotencyKey.delete({ where: { id: existing.id } })
        await prismaPg.idempotencyKey.create({
          data: {
            scope: params.scope,
            key: params.key,
            expiresAt,
          },
        })
        return
      }

      throw new Error('IDEMPOTENCY_REPLAY')
    }
  }

  const cacheKey = `${params.scope}:${params.key}`
  const expiry = memoryKeys.get(cacheKey)
  if (expiry && expiry > nowMs()) {
    throw new Error('IDEMPOTENCY_REPLAY')
  }

  memoryKeys.set(cacheKey, nowMs() + ttlMs)

  if (isStrictMode && memoryKeys.size > 10_000) {
    memoryKeys.clear()
  }
}
