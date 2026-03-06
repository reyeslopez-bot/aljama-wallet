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
const DAYS_WINDOW = 30
const MAX_POINTS = 30
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
  aljamaLastMarketSnapshot?: MarketSnapshot
}

type MarketPoint = {
  timestamp: number
  price: number
}

function downsamplePoints(points: MarketPoint[]): MarketPoint[] {
  if (points.length <= MAX_POINTS) return points
  const step = Math.ceil(points.length / MAX_POINTS)
  const sampled: MarketPoint[] = []
  for (let i = 0; i < points.length; i += step) {
    sampled.push(points[i]!)
  }
  const lastPoint = points[points.length - 1]
  if (sampled[sampled.length - 1]?.timestamp !== lastPoint?.timestamp && lastPoint) {
    sampled.push(lastPoint)
  }
  return sampled
}

function compute24hChange(points: MarketPoint[]): number {
  if (points.length < 2) return 0
  const latest = points[points.length - 1]
  if (!latest || !Number.isFinite(latest.price)) return 0

  const cutoff = latest.timestamp - 24 * 60 * 60 * 1_000
  let baseline = points[0]?.price ?? latest.price

  for (let i = points.length - 1; i >= 0; i -= 1) {
    const point = points[i]
    if (!point) continue
    if (point.timestamp <= cutoff) {
      baseline = point.price
      break
    }
  }

  if (!Number.isFinite(baseline) || baseline === 0) return 0
  return ((latest.price - baseline) / baseline) * 100
}

async function fetchAssetSeries(assetId: string): Promise<{ series: number[]; priceUsd: number; change24h: number }> {
  const url = `${COINGECKO_BASE}/coins/${assetId}/market_chart?vs_currency=usd&days=${DAYS_WINDOW}`
  const res = await fetch(url, { next: { revalidate: 60 } })
  if (!res.ok) throw new Error(`Market fetch failed for ${assetId}`)
  const json = (await res.json()) as { prices?: [number, number][] }
  const points = (json.prices ?? [])
    .map(([timestamp, price]) => ({ timestamp, price }))
    .filter((point) => Number.isFinite(point.timestamp) && Number.isFinite(point.price))
    .sort((a, b) => a.timestamp - b.timestamp)

  if (points.length < 2) {
    throw new Error(`Market series unavailable for ${assetId}`)
  }

  const sampled = downsamplePoints(points)
  const latest = points[points.length - 1]!
  return {
    series: sampled.map((point) => point.price),
    priceUsd: latest.price,
    change24h: compute24hChange(points),
  }
}

async function buildSnapshot(): Promise<MarketSnapshot> {
  const seriesResults = await Promise.all(
    ASSETS.map(async (asset) => {
      const marketData = await fetchAssetSeries(asset.id)
      return {
        ...asset,
        priceUsd: marketData.priceUsd,
        change24h: marketData.change24h,
        series: marketData.series,
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
  const limit = await rateLimit({
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
    globalForMarket.aljamaLastMarketSnapshot = snapshot
    return NextResponse.json(snapshot)
  } catch (error) {
    logWarn('market-snapshot', error)

    const lastRealSnapshot = globalForMarket.aljamaLastMarketSnapshot
    if (lastRealSnapshot) {
      const fallbackSnapshot: MarketSnapshot = {
        ...lastRealSnapshot,
        source: 'fallback',
      }
      globalForMarket.aljamaMarketCache = {
        data: fallbackSnapshot,
        expiresAt: Date.now() + CACHE_TTL_MS,
      }
      return NextResponse.json(fallbackSnapshot)
    }

    return errorJson(
      503,
      'market_snapshot_unavailable',
      'MARKET_SNAPSHOT_UNAVAILABLE',
      { reason: 'No previous market snapshot is available.' },
      {
        headers: {
          'cache-control': 'no-store, max-age=0',
        },
      },
    )
  }
}
