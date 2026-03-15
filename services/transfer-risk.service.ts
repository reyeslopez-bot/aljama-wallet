import { isStrictMode } from '@/lib/security/runtime'
import { getRecentTransferStats } from '@/services/transfer-log.service'
import { recordRiskDecision } from '@/services/risk-decision.service'

export type TransferRiskInput = {
  walletId: string
  userId?: string | null
  chainId: number
  toAddress: string
  amountWei: string
  dailyLimitWei: bigint
  spentTodayWei: bigint
  idempotencyKey: string
  riskAction?: string
}

export type TransferRiskResult = {
  score: number
  decision: 'allow' | 'review' | 'deny'
  reasons: string[]
  features: Record<string, unknown>
}

const DEFAULTS = {
  velocityWindowMs: 5 * 60 * 1000,
  velocityMax: 5,
  reviewScore: 50,
  denyScore: 80,
  highAmountPct: 0.5,
  highAmountScore: 30,
  absoluteWei: 0n,
  absoluteScore: 40,
  newDestinationScore: 10,
  newChainScore: 10,
  velocityScore: 25,
  aiTimeoutMs: 1200,
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}

function envBigInt(name: string, fallback: bigint): bigint {
  const raw = process.env[name]
  if (!raw) return fallback
  try {
    return BigInt(raw)
  } catch {
    return fallback
  }
}

function decide(score: number, reviewScore: number, denyScore: number): 'allow' | 'review' | 'deny' {
  if (score >= denyScore) return 'deny'
  if (score >= reviewScore) return 'review'
  return 'allow'
}

function combineDecision(a: 'allow' | 'review' | 'deny', b: 'allow' | 'review' | 'deny') {
  const rank = { allow: 0, review: 1, deny: 2 }
  return rank[a] >= rank[b] ? a : b
}

async function callAiRisk(features: Record<string, unknown>) {
  const endpoint = process.env.RISK_AI_ENDPOINT
  if (!endpoint) return null

  const token = process.env.RISK_AI_TOKEN
  const timeoutMs = envInt('RISK_AI_TIMEOUT_MS', DEFAULTS.aiTimeoutMs)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ features }),
      signal: controller.signal,
    })

    if (!res.ok) {
      throw new Error(`AI risk endpoint failed: ${res.status}`)
    }

    const json = (await res.json()) as {
      score?: number
      decision?: 'allow' | 'review' | 'deny'
      reasons?: string[]
    }

    return {
      score: Number.isFinite(json.score) ? Number(json.score) : null,
      decision: json.decision ?? null,
      reasons: Array.isArray(json.reasons) ? json.reasons : null,
    }
  } finally {
    clearTimeout(timer)
  }
}

export async function assessTransferRisk(input: TransferRiskInput): Promise<TransferRiskResult> {
  const velocityWindowMs = envInt('RISK_VELOCITY_WINDOW_MS', DEFAULTS.velocityWindowMs)
  const velocityMax = envInt('RISK_VELOCITY_MAX_TX', DEFAULTS.velocityMax)
  const reviewScore = envInt('RISK_REVIEW_SCORE', DEFAULTS.reviewScore)
  const denyScore = envInt('RISK_DENY_SCORE', DEFAULTS.denyScore)
  const highAmountPct = Number(process.env.RISK_HIGH_AMOUNT_PCT ?? DEFAULTS.highAmountPct)
  const highAmountScore = envInt('RISK_HIGH_AMOUNT_SCORE', DEFAULTS.highAmountScore)
  const absoluteWei = envBigInt('RISK_ABSOLUTE_WEI', DEFAULTS.absoluteWei)
  const absoluteScore = envInt('RISK_ABSOLUTE_SCORE', DEFAULTS.absoluteScore)
  const newDestinationScore = envInt('RISK_NEW_DESTINATION_SCORE', DEFAULTS.newDestinationScore)
  const newChainScore = envInt('RISK_NEW_CHAIN_SCORE', DEFAULTS.newChainScore)
  const velocityScore = envInt('RISK_VELOCITY_SCORE', DEFAULTS.velocityScore)

  const amountWei = BigInt(input.amountWei)
  const stats = await getRecentTransferStats({
    walletId: input.walletId,
    chainId: input.chainId,
    toAddress: input.toAddress,
    windowMs: velocityWindowMs,
  })

  let score = 0
  const reasons: string[] = []

  if (absoluteWei > 0n && amountWei >= absoluteWei) {
    score += absoluteScore
    reasons.push('amount_above_absolute_threshold')
  }

  if (input.dailyLimitWei > 0n && highAmountPct > 0) {
    const basis = 10_000n
    const pct = BigInt(Math.round(highAmountPct * Number(basis)))
    const threshold = (input.dailyLimitWei * pct) / basis
    if (amountWei >= threshold) {
      score += highAmountScore
      reasons.push('amount_high_relative_to_limit')
    }
  }

  if (stats.recentCount >= velocityMax) {
    score += velocityScore
    reasons.push('high_transfer_velocity')
  }

  if (stats.destinationCount === 0) {
    score += newDestinationScore
    reasons.push('new_destination')
  }

  if (stats.chainCount === 0) {
    score += newChainScore
    reasons.push('new_chain')
  }

  let decision = decide(score, reviewScore, denyScore)

  let aiDetails: { score?: number | null; decision?: 'allow' | 'review' | 'deny' | null; reasons?: string[] | null } | null = null
  try {
    aiDetails = await callAiRisk({
      walletId: input.walletId,
      userId: input.userId ?? null,
      chainId: input.chainId,
      toAddress: input.toAddress,
      amountWei: input.amountWei,
      spentTodayWei: input.spentTodayWei.toString(),
      dailyLimitWei: input.dailyLimitWei.toString(),
      recentCount: stats.recentCount,
      destinationCount: stats.destinationCount,
      chainCount: stats.chainCount,
      idempotencyKey: input.idempotencyKey,
    })
  } catch {
    const aiRequired = process.env.RISK_AI_REQUIRED === 'true' && isStrictMode
    if (aiRequired) {
      decision = combineDecision(decision, 'review')
      reasons.push('ai_unavailable')
    }
  }

  if (aiDetails) {
    if (typeof aiDetails.score === 'number') {
      score = Math.max(score, aiDetails.score)
    }
    if (aiDetails.decision) {
      decision = combineDecision(decision, aiDetails.decision)
    }
    if (aiDetails.reasons?.length) {
      reasons.push(...aiDetails.reasons)
    }
  }

  const result: TransferRiskResult = {
    score,
    decision,
    reasons,
    features: {
      velocityWindowMs,
      velocityMax,
      reviewScore,
      denyScore,
      amountWei: amountWei.toString(),
      recentCount: stats.recentCount,
      destinationCount: stats.destinationCount,
      chainCount: stats.chainCount,
    },
  }

  await recordRiskDecision({
    action: input.riskAction ?? 'wallet.send',
    walletId: input.walletId,
    userId: input.userId ?? null,
    score: result.score,
    decision: result.decision,
    reasons: result.reasons,
    context: result.features,
  })

  return result
}
