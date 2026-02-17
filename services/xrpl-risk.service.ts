import { assessTransferRisk } from '@/services/transfer-risk.service'

type XrplRiskInput = {
  walletId: string
  userId: string
  amountUnits: string
  idempotencyKey: string
  networkNumericId?: number
  destinationAddress?: string
}

const MAX_UINT256 = (1n << 256n) - 1n

function toWeiLike(amountUnits: string): string {
  const trimmed = amountUnits.trim()
  if (!trimmed) return '1'
  const normalized = trimmed.replace(/,/g, '')
  const numeric = Number(normalized)
  if (!Number.isFinite(numeric) || numeric <= 0) return '1'
  const scaled = BigInt(Math.max(1, Math.round(numeric * 1_000_000)))
  if (scaled > MAX_UINT256) return MAX_UINT256.toString()
  return scaled.toString()
}

function readDailyLimitWei(): bigint {
  const raw = process.env.WALLET_DAILY_LIMIT_WEI
  if (!raw || !raw.trim()) return MAX_UINT256
  try {
    return BigInt(raw)
  } catch {
    return MAX_UINT256
  }
}

export async function assessXrplActionRisk(input: XrplRiskInput) {
  const amountWei = toWeiLike(input.amountUnits)
  const chainId = input.networkNumericId ?? 999_000

  return assessTransferRisk({
    walletId: input.walletId,
    userId: input.userId,
    chainId,
    toAddress: input.destinationAddress ?? input.walletId,
    amountWei,
    dailyLimitWei: readDailyLimitWei(),
    spentTodayWei: 0n,
    idempotencyKey: input.idempotencyKey,
  })
}
