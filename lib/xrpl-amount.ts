import { xrpToDrops } from 'xrpl'

export const DEFAULT_SWAP_SLIPPAGE_BPS = 50

export type XrplAmountInput = {
  currency: string
  value: string
  issuer?: string
}

export function normalizeCurrency(currency: string): string {
  return currency.trim().toUpperCase()
}

export function isXrpCurrency(currency: string): boolean {
  return normalizeCurrency(currency) === 'XRP'
}

export function toXrplAmount(amount: XrplAmountInput) {
  const currency = normalizeCurrency(amount.currency)
  const value = amount.value.trim()
  if (currency === 'XRP') {
    return xrpToDrops(value)
  }
  return {
    currency,
    issuer: amount.issuer?.trim() ?? '',
    value,
  }
}
