import type { Prisma, PrismaClient } from '@/prisma/generated/prisma-crdb'
import { prismaCrdb } from '@/lib/prisma-crdb'
import { isStrictMode } from '@/lib/security/runtime'

const GLOBAL_POLICY_SCOPE = 'GLOBAL'
const DEFAULT_POLICY_SOURCE = 'system'
const MAX_UINT256 = (1n << 256n) - 1n

type PolicyReader = Pick<PrismaClient, 'policy'> | Pick<Prisma.TransactionClient, 'policy'>

export type StoredPolicyDecision = 'allow' | 'review' | 'deny'

export type TriggeredWalletPolicy = {
  id: string | null
  policyType: string
  decision: StoredPolicyDecision
  eventType: string
  reason: string
  limitAmount: string | null
  timeWindow: string | null
  config: Record<string, unknown> | null
}

function normalizeScopeChainType(value?: string | null): string {
  const normalized = value?.trim().toUpperCase()
  return normalized ? normalized : GLOBAL_POLICY_SCOPE
}

function normalizeScopeNetworkId(value?: string | null): string {
  const normalized = value?.trim()
  return normalized ? normalized : GLOBAL_POLICY_SCOPE
}

function parseLimitAmount(value?: string | null): bigint | null {
  if (!value?.trim()) return null
  try {
    return BigInt(value)
  } catch {
    return null
  }
}

function normalizeConfig(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function normalizeAddressForPolicy(address: string): string {
  return address.trim().toLowerCase()
}

function readDefaultDailyLimitWei(): bigint {
  const raw = process.env.WALLET_DAILY_LIMIT_WEI
  if (raw === undefined || raw === null || raw === '') {
    if (isStrictMode) throw new Error('Missing WALLET_DAILY_LIMIT_WEI')
    return MAX_UINT256
  }
  return BigInt(raw)
}

async function listPoliciesForScope(
  reader: PolicyReader,
  input: { walletId: string; chainType: string; networkId?: string | null },
) {
  const chainType = normalizeScopeChainType(input.chainType)
  const networkId = normalizeScopeNetworkId(input.networkId)

  const records = await reader.policy.findMany({
    where: {
      walletId: input.walletId,
      enabled: true,
      scopeChainType: { in: [GLOBAL_POLICY_SCOPE, chainType] },
      scopeNetworkId: { in: [GLOBAL_POLICY_SCOPE, networkId] },
    },
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
  })

  return records.sort((left, right) => {
    const leftSpecificity =
      (left.scopeChainType === chainType ? 1 : 0) + (left.scopeNetworkId === networkId ? 1 : 0)
    const rightSpecificity =
      (right.scopeChainType === chainType ? 1 : 0) + (right.scopeNetworkId === networkId ? 1 : 0)
    return rightSpecificity - leftSpecificity
  })
}

export async function seedDefaultWalletPolicies(
  tx: Pick<Prisma.TransactionClient, 'policy'>,
  input: { walletId: string; chainType: string; networkId?: string | null },
) {
  const limitAmount = process.env.WALLET_DAILY_LIMIT_WEI?.trim()
  if (!limitAmount) return

  const scopeChainType = normalizeScopeChainType(input.chainType)
  const scopeNetworkId = normalizeScopeNetworkId(input.networkId)

  await tx.policy.upsert({
    where: {
      walletId_scopeChainType_scopeNetworkId_policyType: {
        walletId: input.walletId,
        scopeChainType,
        scopeNetworkId,
        policyType: 'daily_spend_limit',
      },
    },
    update: {
      limitAmount,
      timeWindow: 'utc_day',
      enabled: true,
      decisionMode: 'deny',
      config: { source: DEFAULT_POLICY_SOURCE },
    },
    create: {
      walletId: input.walletId,
      policyType: 'daily_spend_limit',
      scopeChainType,
      scopeNetworkId,
      limitAmount,
      timeWindow: 'utc_day',
      enabled: true,
      decisionMode: 'deny',
      config: { source: DEFAULT_POLICY_SOURCE },
    },
  })
}

export async function getWalletDailyLimitWei(input: {
  walletId: string
  chainType: string
  networkId?: string | null
}): Promise<bigint> {
  const records = await listPoliciesForScope(prismaCrdb, input)
  const dailyLimit = records.find((record) => record.policyType === 'daily_spend_limit')
  const parsed = parseLimitAmount(dailyLimit?.limitAmount)
  return parsed ?? readDefaultDailyLimitWei()
}

export async function evaluateStoredWalletPolicies(input: {
  walletId: string
  chainType: string
  networkId?: string | null
  toAddress: string
  amountBaseUnits: bigint
  spentInWindowBaseUnits: bigint
}): Promise<{
  decision: StoredPolicyDecision
  reasons: string[]
  triggeredPolicies: TriggeredWalletPolicy[]
}> {
  const records = await listPoliciesForScope(prismaCrdb, input)
  const triggeredPolicies: TriggeredWalletPolicy[] = []
  const normalizedDestination = normalizeAddressForPolicy(input.toAddress)

  for (const record of records) {
    const config = normalizeConfig(record.config)
    const limitAmount = parseLimitAmount(record.limitAmount)

    switch (record.policyType) {
      case 'daily_spend_limit': {
        if (limitAmount !== null && input.spentInWindowBaseUnits + input.amountBaseUnits > limitAmount) {
          triggeredPolicies.push({
            id: record.id,
            policyType: record.policyType,
            decision: record.decisionMode === 'review' ? 'review' : 'deny',
            eventType: 'limit_exceeded',
            reason: 'daily_spend_limit_exceeded',
            limitAmount: record.limitAmount,
            timeWindow: record.timeWindow,
            config,
          })
        }
        break
      }
      case 'max_tx_value': {
        if (limitAmount !== null && input.amountBaseUnits > limitAmount) {
          triggeredPolicies.push({
            id: record.id,
            policyType: record.policyType,
            decision: record.decisionMode === 'review' ? 'review' : 'deny',
            eventType: 'max_tx_value_exceeded',
            reason: 'max_tx_value_exceeded',
            limitAmount: record.limitAmount,
            timeWindow: record.timeWindow,
            config,
          })
        }
        break
      }
      case 'whitelist_only': {
        const allowedAddresses = Array.isArray(config?.allowedAddresses)
          ? config.allowedAddresses
              .filter((value): value is string => typeof value === 'string')
              .map((value) => normalizeAddressForPolicy(value))
          : []
        if (allowedAddresses.length > 0 && !allowedAddresses.includes(normalizedDestination)) {
          triggeredPolicies.push({
            id: record.id,
            policyType: record.policyType,
            decision: record.decisionMode === 'review' ? 'review' : 'deny',
            eventType: 'destination_not_whitelisted',
            reason: 'destination_not_whitelisted',
            limitAmount: record.limitAmount,
            timeWindow: record.timeWindow,
            config,
          })
        }
        break
      }
      case 'require_review': {
        triggeredPolicies.push({
          id: record.id,
          policyType: record.policyType,
          decision: 'review',
          eventType: 'review_required',
          reason: 'review_required',
          limitAmount: record.limitAmount,
          timeWindow: record.timeWindow,
          config,
        })
        break
      }
      default:
        break
    }
  }

  const decision = triggeredPolicies.some((policy) => policy.decision === 'deny')
    ? 'deny'
    : triggeredPolicies.some((policy) => policy.decision === 'review')
      ? 'review'
      : 'allow'

  return {
    decision,
    reasons: triggeredPolicies.map((policy) => policy.reason),
    triggeredPolicies,
  }
}

export async function recordPolicyEvents(input: {
  walletId: string
  chainType?: string | null
  networkId?: string | null
  txHash?: string | null
  idempotencyKey?: string | null
  payload?: Prisma.InputJsonValue
  triggeredPolicies: TriggeredWalletPolicy[]
}) {
  if (input.triggeredPolicies.length === 0) return

  await prismaCrdb.$transaction(
    input.triggeredPolicies.map((policy) =>
      prismaCrdb.policyEvent.create({
        data: {
          policyId: policy.id,
          walletId: input.walletId,
          scopeChainType: normalizeScopeChainType(input.chainType),
          scopeNetworkId: normalizeScopeNetworkId(input.networkId),
          policyType: policy.policyType,
          eventType: policy.eventType,
          decision: policy.decision,
          txHash: input.txHash?.trim() || null,
          idempotencyKey: input.idempotencyKey?.trim() || null,
          payload: input.payload,
        },
      }),
    ),
  )
}
