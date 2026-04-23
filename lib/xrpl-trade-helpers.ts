import { resolveXrplNetwork } from '@/lib/xrpl-networks'
import { isXrpCurrency } from '@/lib/xrpl-amount'

export function parseCsv(value: string | undefined): Set<string> {
  if (!value) return new Set()
  return new Set(
    value
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  )
}

export function shortHash(value: string | null | undefined): string {
  if (!value) return '--'
  if (value.length <= 18) return value
  return `${value.slice(0, 8)}...${value.slice(-8)}`
}

export function isMissingSignerConfig(message: string): boolean {
  return /Missing XRPL signer seed/i.test(message)
}

export function looksLikeClassicAddress(value: string): boolean {
  return /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(value.trim())
}

export function parsePositiveAmount(value: string): number | null {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return parsed
}

export function formatPreviewAmount(value: number): string {
  if (!Number.isFinite(value)) return '--'
  const formatted = value.toFixed(6)
  return formatted.replace(/\.?0+$/, '')
}

export function explorerTransactionUrl(networkId: string, txHash: string): string {
  const explorerBase = resolveXrplNetwork(networkId).explorerUrl.replace(/\/+$/, '')
  return `${explorerBase}/transactions/${txHash}`
}

export function formatAssetSelection(currency: string, issuer: string): string {
  const code = currency.trim().toUpperCase()
  const normalizedIssuer = issuer.trim()
  if (isXrpCurrency(code) || !normalizedIssuer) return code
  return `${code} (${shortHash(normalizedIssuer)})`
}
