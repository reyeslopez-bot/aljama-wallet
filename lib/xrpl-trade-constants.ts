export type CurrencyOption = {
  code: string
  label: string
}

export const TRADE_CURRENCY_OPTIONS: CurrencyOption[] = [
  { code: 'XRP', label: 'XRP (Ripple)' },
  { code: 'USD', label: 'USD (US Dollar)' },
  { code: 'EUR', label: 'EUR (Euro)' },
  { code: 'AED', label: 'AED (UAE Dirham)' },
  { code: 'SAR', label: 'SAR (Saudi Riyal)' },
  { code: 'JPY', label: 'JPY (Japanese Yen)' },
  { code: 'XAU', label: 'XAU (Gold)' },
]

export const ISSUED_CURRENCY_OPTIONS = TRADE_CURRENCY_OPTIONS.filter((option) => option.code !== 'XRP')

export const DEFAULT_QUOTE_ISSUER =
  process.env.NEXT_PUBLIC_XRPL_DEFAULT_QUOTE_ISSUER?.trim() || 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'

export const ISSUER_ACCOUNT_FLAG_OPTIONS = [
  { value: '', label: 'No flag change' },
  { value: 'default_ripple', label: 'Default Ripple' },
  { value: 'require_auth', label: 'Require Auth' },
  { value: 'disallow_xrp', label: 'Disallow XRP' },
  { value: 'deposit_auth', label: 'Deposit Auth' },
] as const

export const ISSUER_POLICY_STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'archived', label: 'Archived' },
] as const

export const ISSUER_HOLDER_REVIEW_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'revoked', label: 'Revoked' },
] as const
