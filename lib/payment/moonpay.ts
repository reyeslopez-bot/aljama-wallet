const MOONPAY_BUY_BASE = 'https://buy.moonpay.com'
const MOONPAY_SELL_BASE = 'https://sell.moonpay.com'

export type MoonPayMode = 'buy' | 'sell'

export function buildMoonPayBuyUrl(apiKey: string, walletAddress: string, currencyCode = 'eth'): string {
  const params = new URLSearchParams({
    apiKey,
    walletAddress,
    defaultCurrencyCode: currencyCode,
    colorCode: '#D2A762',
  })
  return `${MOONPAY_BUY_BASE}?${params.toString()}`
}

export function buildMoonPaySellUrl(apiKey: string, walletAddress: string, currencyCode = 'eth'): string {
  const params = new URLSearchParams({
    apiKey,
    walletAddress,
    baseCurrencyCode: currencyCode,
    colorCode: '#D2A762',
  })
  return `${MOONPAY_SELL_BASE}?${params.toString()}`
}

export function buildMoonPayUrl(mode: MoonPayMode, apiKey: string, walletAddress: string, currencyCode?: string): string {
  return mode === 'buy'
    ? buildMoonPayBuyUrl(apiKey, walletAddress, currencyCode)
    : buildMoonPaySellUrl(apiKey, walletAddress, currencyCode)
}

export function isMoonPayEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_MOONPAY_API_KEY?.trim())
}
