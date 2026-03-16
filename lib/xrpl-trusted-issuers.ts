import { normalizeCurrency } from '@/lib/xrpl-amount'
import { getAllowedIssuerSet } from '@/lib/xrpl-issued-assets'

export type TrustedIssuerPolicySource = 'policy' | 'allowlist' | 'none'

type TrustedIssuerPolicy = Map<string, string[]>

function splitIssuerList(value: string): string[] {
  return value
    .split(/[|,]/)
    .map((issuer) => issuer.trim())
    .filter(Boolean)
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values))
}

function parseJsonPolicy(raw: string): TrustedIssuerPolicy {
  const parsed = JSON.parse(raw) as Record<string, unknown>
  const entries = new Map<string, string[]>()

  for (const [currencyRaw, value] of Object.entries(parsed)) {
    const currency = normalizeCurrency(currencyRaw)
    if (Array.isArray(value)) {
      const issuers = dedupe(
        value
          .filter((item): item is string => typeof item === 'string')
          .map((issuer) => issuer.trim())
          .filter(Boolean),
      )
      if (issuers.length > 0) {
        entries.set(currency, issuers)
      }
      continue
    }

    if (typeof value === 'string') {
      const issuers = dedupe(splitIssuerList(value))
      if (issuers.length > 0) {
        entries.set(currency, issuers)
      }
    }
  }

  return entries
}

function parseDelimitedPolicy(raw: string): TrustedIssuerPolicy {
  const entries = new Map<string, string[]>()

  for (const segment of raw.split(';')) {
    const trimmed = segment.trim()
    if (!trimmed) continue

    const [currencyRaw, issuersRaw] = trimmed.split(':', 2)
    const currency = normalizeCurrency(currencyRaw ?? '')
    const issuers = dedupe(splitIssuerList(issuersRaw ?? ''))
    if (!currency || issuers.length === 0) continue
    entries.set(currency, issuers)
  }

  return entries
}

function parseTrustedIssuerPolicy(raw: string | undefined): TrustedIssuerPolicy {
  const normalized = raw?.trim()
  if (!normalized) return new Map()

  try {
    if (normalized.startsWith('{')) {
      return parseJsonPolicy(normalized)
    }
  } catch {
    return new Map()
  }

  return parseDelimitedPolicy(normalized)
}

export function getTrustedIssuersForCurrency(currencyInput: string): {
  issuers: string[]
  source: TrustedIssuerPolicySource
} {
  const currency = normalizeCurrency(currencyInput)
  if (currency === 'XRP') {
    return {
      issuers: [],
      source: 'none',
    }
  }

  const policy = parseTrustedIssuerPolicy(process.env.XRPL_TRADE_TRUSTED_ISSUERS)
  const policyIssuers = policy.get(currency) ?? []
  if (policyIssuers.length > 0) {
    return {
      issuers: policyIssuers,
      source: 'policy',
    }
  }

  const { enabled, allowed } = getAllowedIssuerSet()
  if (enabled) {
    return {
      issuers: Array.from(allowed),
      source: 'allowlist',
    }
  }

  return {
    issuers: [],
    source: 'none',
  }
}
