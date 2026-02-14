// app/api/market-snapshot/route.ts
import { NextResponse } from 'next/server'
import { buildRateLimitKey, rateLimit } from '@/lib/security/rate-limit'
import { errorJson } from '@/lib/security/api-response'
import { logWarn } from '@/lib/security/logging'

type MarketAsset = {
  id: string
  symbol: string
  name: string
  marketGroup: 'xrpl' | 'reference'
  network: string
  priceUsd: number
  change24h: number
  series: number[]
}

type MarketSnapshot = {
  ok: true
  source: 'coingecko' | 'fallback'
  updatedAt: string
  assets: MarketAsset[]
}

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3'
const MAX_POINTS = 24
const CACHE_TTL_MS = 60_000

const ASSETS = [
  {
    id: 'ripple',
    symbol: 'XRP',
    name: 'XRP',
    marketGroup: 'xrpl' as const,
    network: 'XRPL',
  },
  {
    id: 'bitcoin',
    symbol: 'BTC',
    name: 'Bitcoin',
    marketGroup: 'reference' as const,
    network: 'Bitcoin',
  },
  {
    id: 'ethereum',
    symbol: 'ETH',
    name: 'Ethereum',
    marketGroup: 'reference' as const,
    network: 'Ethereum',
  },
  {
    id: 'usd-coin',
    symbol: 'USDC',
    name: 'USD Coin',
    marketGroup: 'reference' as const,
    network: 'Ethereum',
  },
  {
    id: 'euro-coin',
    symbol: 'EURC',
    name: 'Euro Coin',
    marketGroup: 'reference' as const,
    network: 'Ethereum',
  },
]

const globalForMarket = globalThis as unknown as {
  aljamaMarketCache?: { expiresAt: number; data: MarketSnapshot }
}

function downsample(prices: number[]): number[] {
  if (prices.length <= MAX_POINTS) return prices
  const step = Math.ceil(prices.length / MAX_POINTS)
  const sampled: number[] = []
  for (let i = 0; i < prices.length; i += step) {
    sampled.push(prices[i]!)
  }
  return sampled
}

function fallbackSnapshot(): MarketSnapshot {
  const seed = [1, 1.02, 0.99, 1.03, 1.01, 1.04, 1.02, 1.06, 1.03, 1.05, 1.04, 1.07, 1.06, 1.08, 1.07, 1.06, 1.05, 1.04, 1.05, 1.03, 1.02, 1.01, 1.02, 1.03]
  const assets = ASSETS.map((asset, index) => {
    const jitter = seed.map((v) => v + (index * 0.002))
    const last = jitter[jitter.length - 1] ?? 1
    const first = jitter[0] ?? 1
    return {
      ...asset,
      priceUsd: last,
      change24h: ((last - first) / first) * 100,
      series: jitter,
    }
  })

  return {
    ok: true,
    source: 'fallback',
    updatedAt: new Date().toISOString(),
    assets,
  }
}

async function fetchAssetSeries(assetId: string): Promise<number[]> {
  const url = `${COINGECKO_BASE}/coins/${assetId}/market_chart?vs_currency=usd&days=1`
  const res = await fetch(url, { next: { revalidate: 60 } })
  if (!res.ok) throw new Error(`Market fetch failed for ${assetId}`)
  const json = (await res.json()) as { prices?: [number, number][] }
  const series = (json.prices ?? []).map((entry) => entry[1])
  return downsample(series)
}

async function buildSnapshot(): Promise<MarketSnapshot> {
  const seriesResults = await Promise.all(
    ASSETS.map(async (asset) => {
      const series = await fetchAssetSeries(asset.id)
      const first = series[0] ?? 1
      const last = series[series.length - 1] ?? first
      return {
        ...asset,
        priceUsd: last,
        change24h: ((last - first) / first) * 100,
        series,
      }
    }),
  )

  return {
    ok: true,
    source: 'coingecko',
    updatedAt: new Date().toISOString(),
    assets: seriesResults,
  }
}

export async function GET(req?: Request) {
  const request = req ?? new Request('http://localhost')
  const rateKey = buildRateLimitKey(request, null)
  const limit = rateLimit({
    bucket: 'market-snapshot',
    key: rateKey,
    limit: 120,
    windowMs: 60_000,
  })
  if (!limit.ok) {
    return errorJson(
      429,
      'rate_limited',
      'RATE_LIMITED',
      { retryAfter: limit.retryAfter },
      { headers: { 'retry-after': String(limit.retryAfter) } },
    )
  }

  const cached = globalForMarket.aljamaMarketCache
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.data)
  }

  try {
    const snapshot = await buildSnapshot()
    globalForMarket.aljamaMarketCache = {
      data: snapshot,
      expiresAt: Date.now() + CACHE_TTL_MS,
    }
    return NextResponse.json(snapshot)
  } catch (error) {
    logWarn('market-snapshot', error)
    const snapshot = fallbackSnapshot()
    globalForMarket.aljamaMarketCache = {
      data: snapshot,
      expiresAt: Date.now() + CACHE_TTL_MS,
    }
    return NextResponse.json(snapshot)
  }
}
