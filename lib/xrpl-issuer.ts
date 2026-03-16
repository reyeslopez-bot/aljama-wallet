import { AccountSetAsfFlags, isValidClassicAddress } from 'xrpl'
import { normalizeCurrency } from '@/lib/xrpl-amount'

export const XRPL_ISSUER_ACCOUNT_FLAG_NAMES = [
  'default_ripple',
  'require_auth',
  'disallow_xrp',
  'deposit_auth',
] as const

export type XrplIssuerAccountFlag = (typeof XRPL_ISSUER_ACCOUNT_FLAG_NAMES)[number]

const XRPL_ISSUER_ACCOUNT_FLAGS: Record<XrplIssuerAccountFlag, number> = {
  default_ripple: AccountSetAsfFlags.asfDefaultRipple,
  require_auth: AccountSetAsfFlags.asfRequireAuth,
  disallow_xrp: AccountSetAsfFlags.asfDisallowXRP,
  deposit_auth: AccountSetAsfFlags.asfDepositAuth,
}

const ISSUER_DOMAIN_PATTERN =
  /^(?=.{1,255}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/

export function resolveXrplIssuerAccountFlag(flag: XrplIssuerAccountFlag): number {
  return XRPL_ISSUER_ACCOUNT_FLAGS[flag]
}

export function normalizeXrplIssuerDomain(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase()
  if (!normalized) return undefined
  if (
    normalized.includes('://') ||
    normalized.includes('/') ||
    normalized.includes('?') ||
    normalized.includes('#')
  ) {
    throw new Error('Issuer domain must be a bare hostname')
  }
  if (!ISSUER_DOMAIN_PATTERN.test(normalized)) {
    throw new Error('Issuer domain must be a valid ASCII hostname')
  }
  return normalized
}

export function encodeXrplIssuerDomain(domain: string): string {
  const bytes = new TextEncoder().encode(domain)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase()
}

export function transferFeeBpsToTransferRate(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 10_000) {
    throw new Error('Transfer fee bps must be an integer between 0 and 10000')
  }
  return 1_000_000_000 + value * 100_000
}

export function normalizeIssuedCurrency(value: string): string {
  const currency = normalizeCurrency(value)
  if (!currency) {
    throw new Error('Issued currency is required')
  }
  if (currency === 'XRP') {
    throw new Error('Issued currency must not be XRP')
  }
  return currency
}

export function normalizeXrplClassicAddress(value: string, label: string): string {
  const normalized = value.trim()
  if (!isValidClassicAddress(normalized)) {
    throw new Error(`Invalid ${label}`)
  }
  return normalized
}
