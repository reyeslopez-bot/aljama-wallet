import { prismaPg } from '@/lib/prisma-pg'

const globalForOwnership = globalThis as unknown as {
  walletOwnership?: Map<string, Set<string>>
}

const memoryOwnership = globalForOwnership.walletOwnership ?? new Map<string, Set<string>>()
if (!globalForOwnership.walletOwnership) {
  globalForOwnership.walletOwnership = memoryOwnership
}

function canUsePg() {
  return Boolean(process.env.PG_DATABASE_URL ?? process.env.POSTGRES_URL)
}

export async function linkWalletToUser(userId: string, walletId: string) {
  if (!userId || !walletId) return

  if (canUsePg()) {
    try {
      await prismaPg.userWallet.create({
        data: {
          userId,
          walletId,
        },
      })
      return
    } catch (error: unknown) {
      // Ignore unique constraint collisions (wallet already linked)
      const err = error as { code?: string } | null
      if (err?.code === 'P2002') return
      throw error
    }
  }

  const set = memoryOwnership.get(userId) ?? new Set<string>()
  set.add(walletId)
  memoryOwnership.set(userId, set)
}

export async function getWalletIdsForUser(userId: string): Promise<string[]> {
  if (!userId) return []

  if (canUsePg()) {
    const rows = await prismaPg.userWallet.findMany({
      where: { userId },
      select: { walletId: true },
    })
    return rows.map((row) => row.walletId)
  }

  return Array.from(memoryOwnership.get(userId) ?? [])
}

export async function userOwnsWallet(userId: string, walletId: string): Promise<boolean> {
  if (!userId || !walletId) return false

  if (canUsePg()) {
    const record = await prismaPg.userWallet.findUnique({
      where: {
        userId_walletId: {
          userId,
          walletId,
        },
      },
      select: { id: true },
    })
    return Boolean(record)
  }

  const set = memoryOwnership.get(userId)
  return set ? set.has(walletId) : false
}
