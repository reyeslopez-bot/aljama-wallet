import { prismaPg } from '@/lib/prisma-pg'
import type { Prisma } from '@/prisma/generated/pg'
import { isStrictMode } from '@/lib/security/runtime'
import { logWarn } from '@/lib/security/logging'

export type RiskDecisionInput = {
  action: string
  walletId?: string | null
  userId?: string | null
  score: number
  decision: 'allow' | 'review' | 'deny'
  reasons?: string[]
  context?: Record<string, unknown>
}

const MAX_EVENTS = 2000

const globalForRisk = globalThis as unknown as {
  riskDecisions?: Array<RiskDecisionInput & { createdAt: number }>
}

const memoryDecisions = globalForRisk.riskDecisions ?? []
if (!globalForRisk.riskDecisions) {
  globalForRisk.riskDecisions = memoryDecisions
}

function canUsePg() {
  return Boolean(process.env.PG_DATABASE_URL ?? process.env.POSTGRES_URL)
}

function toJson(value?: Record<string, unknown> | string[]): Prisma.InputJsonValue | undefined {
  if (!value) return undefined
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

export async function recordRiskDecision(input: RiskDecisionInput) {
  if (canUsePg()) {
    try {
      await prismaPg.riskDecision.create({
        data: {
          action: input.action,
          walletId: input.walletId ?? null,
          userId: input.userId ?? null,
          score: Math.round(input.score),
          decision: input.decision,
          reasons: toJson(input.reasons),
          context: toJson(input.context),
        },
      })
      return
    } catch (error) {
      if (isStrictMode) throw error
      logWarn('risk-decision', error)
    }
  }

  memoryDecisions.push({ ...input, createdAt: Date.now() })
  if (memoryDecisions.length > MAX_EVENTS) {
    memoryDecisions.splice(0, memoryDecisions.length - MAX_EVENTS)
  }
}
