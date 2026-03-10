// app/api/market-snapshot/route.ts
import { NextResponse } from 'next/server'
import { buildRateLimitKey, rateLimit } from '@/lib/security/rate-limit'
import { errorJson } from '@/lib/security/api-response'
import { withApiRoute, type ApiRouteContext } from '@/lib/security/api-route'
import { logError, logInfo, logWarn } from '@/lib/security/logging'
import { emitSecurityAlert } from '@/services/security-alert.service'

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
const DEFAULT_MARKET_FALLBACK_ALERT_AFTER_MS = 5 * 60 * 1_000
const DEFAULT_MARKET_FALLBACK_ALERT_REPEAT_MS = 30 * 60 * 1_000
const MARKET_FALLBACK_RUNBOOK_HINT =
  'Check CoinGecko availability and rate limits, confirm runtime egress, and review recent fallback responses before escalating.'

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

const FALLBACK_MARKET_SERIES = {
  ripple: {
    priceUsd: 0.62,
    change24h: 1.2,
    series: [
      0.58, 0.59, 0.58, 0.57, 0.58, 0.59, 0.6, 0.61, 0.6, 0.59,
      0.6, 0.61, 0.62, 0.61, 0.6, 0.61, 0.62, 0.63, 0.62, 0.61,
      0.62, 0.63, 0.64, 0.63, 0.62, 0.61, 0.62, 0.63, 0.62, 0.62,
    ],
  },
  bitcoin: {
    priceUsd: 69_000,
    change24h: -0.1,
    series: [
      66_800, 67_050, 66_900, 67_200, 67_500, 67_300, 67_900, 68_100, 67_850, 68_200,
      68_450, 68_100, 68_700, 68_950, 68_600, 68_850, 69_100, 68_900, 68_650, 68_800,
      69_050, 69_200, 68_950, 68_750, 68_900, 69_150, 69_300, 69_100, 68_950, 69_000,
    ],
  },
  ethereum: {
    priceUsd: 3_450,
    change24h: 0.6,
    series: [
      3_220, 3_240, 3_230, 3_250, 3_270, 3_260, 3_280, 3_300, 3_290, 3_315,
      3_330, 3_320, 3_340, 3_360, 3_345, 3_355, 3_370, 3_385, 3_375, 3_390,
      3_405, 3_395, 3_410, 3_425, 3_415, 3_430, 3_440, 3_435, 3_445, 3_450,
    ],
  },
  'usd-coin': {
    priceUsd: 1,
    change24h: 0,
    series: [
      1, 1.0001, 0.9999, 1, 1.0002, 1, 0.9998, 1, 1.0001, 1,
      1, 0.9999, 1.0001, 1, 1, 1.0001, 0.9999, 1, 1, 1.0001,
      1, 0.9999, 1.0001, 1, 1, 0.9999, 1, 1.0001, 1, 1,
    ],
  },
  'euro-coin': {
    priceUsd: 1.09,
    change24h: 0.2,
    series: [
      1.07, 1.071, 1.072, 1.071, 1.073, 1.074, 1.073, 1.074, 1.075, 1.076,
      1.075, 1.076, 1.077, 1.078, 1.077, 1.078, 1.079, 1.08, 1.081, 1.08,
      1.081, 1.082, 1.083, 1.082, 1.084, 1.085, 1.086, 1.087, 1.088, 1.09,
    ],
  },
} satisfies Record<string, { priceUsd: number; change24h: number; series: number[] }>

const globalForMarket = globalThis as unknown as {
  aljamaMarketCache?: { expiresAt: number; data: MarketSnapshot }
  aljamaLastMarketSnapshot?: MarketSnapshot
  aljamaMarketFallbackState?: { activeSince: number | null; lastAlertedAt: number | null }
}

type MarketPoint = {
  timestamp: number
  price: number
}

type MarketAssetConfig = (typeof ASSETS)[number]

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

function buildSeededFallbackSnapshot(): MarketSnapshot {
  return {
    ok: true,
    source: 'fallback',
    updatedAt: new Date().toISOString(),
    assets: ASSETS.map((asset) => {
      const fallback = FALLBACK_MARKET_SERIES[asset.id as keyof typeof FALLBACK_MARKET_SERIES]
      return {
        ...asset,
        priceUsd: fallback.priceUsd,
        change24h: fallback.change24h,
        series: fallback.series,
      }
    }),
  }
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(0, Math.floor(parsed))
}

function fallbackAlertAfterMs() {
  return envInt('MARKET_SNAPSHOT_FALLBACK_ALERT_AFTER_MS', DEFAULT_MARKET_FALLBACK_ALERT_AFTER_MS)
}

function fallbackAlertRepeatMs() {
  return envInt('MARKET_SNAPSHOT_FALLBACK_ALERT_REPEAT_MS', DEFAULT_MARKET_FALLBACK_ALERT_REPEAT_MS)
}

function getFallbackState() {
  const existing = globalForMarket.aljamaMarketFallbackState
  if (existing) return existing

  const initialState = { activeSince: null, lastAlertedAt: null }
  globalForMarket.aljamaMarketFallbackState = initialState
  return initialState
}

function createMarketFetchError(
  asset: MarketAssetConfig,
  url: string,
  message: string,
  context: Record<string, unknown>,
  cause?: unknown,
) {
  const error = new Error(message, cause === undefined ? undefined : { cause })
  return Object.assign(error, {
    assetId: asset.id,
    assetSymbol: asset.symbol,
    provider: 'coingecko',
    url,
    ...context,
  })
}

async function fetchAssetSeries(asset: MarketAssetConfig): Promise<{ series: number[]; priceUsd: number; change24h: number }> {
  const url = `${COINGECKO_BASE}/coins/${asset.id}/market_chart?vs_currency=usd&days=${DAYS_WINDOW}`
  let res: Response
  try {
    res = await fetch(url, { next: { revalidate: 60 } })
  } catch (error) {
    throw createMarketFetchError(
      asset,
      url,
      `Market fetch failed for ${asset.id}`,
      { failureStage: 'fetch' },
      error,
    )
  }

  if (!res.ok) {
    throw createMarketFetchError(asset, url, `Market fetch failed for ${asset.id}`, {
      failureStage: 'response',
      upstreamStatus: res.status,
      upstreamStatusText: res.statusText,
    })
  }

  const json = (await res.json()) as { prices?: [number, number][] }
  const points = (json.prices ?? [])
    .map(([timestamp, price]) => ({ timestamp, price }))
    .filter((point) => Number.isFinite(point.timestamp) && Number.isFinite(point.price))
    .sort((a, b) => a.timestamp - b.timestamp)

  if (points.length < 2) {
    throw createMarketFetchError(asset, url, `Market series unavailable for ${asset.id}`, {
      failureStage: 'normalize',
      returnedPoints: points.length,
    })
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
      const marketData = await fetchAssetSeries(asset)
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

async function maybeEmitFallbackModeAlert(
  request: Request,
  context: ApiRouteContext,
  fallbackStrategy: 'last_real_snapshot' | 'seeded_snapshot',
  fallbackActiveMs: number,
  hasLastRealSnapshot: boolean,
) {
  const state = getFallbackState()
  const alertAfterMs = fallbackAlertAfterMs()
  const repeatMs = fallbackAlertRepeatMs()
  if (fallbackActiveMs < alertAfterMs) return
  if (state.lastAlertedAt !== null && Date.now() - state.lastAlertedAt < repeatMs) return

  const activeMinutes = Math.max(1, Math.floor(fallbackActiveMs / 60_000))
  await emitSecurityAlert({
    ruleId: 'market.snapshot.fallback_mode.active',
    source: 'api.market-snapshot',
    severity: 'medium',
    repetitive: true,
    title: 'Market snapshot fallback mode remains active',
    description: `Market snapshot has served fallback data for ${activeMinutes} minute(s).`,
    fingerprint: 'market-snapshot:fallback-mode',
    runbookHint: MARKET_FALLBACK_RUNBOOK_HINT,
    context: {
      provider: 'coingecko',
      requestId: context.requestId,
      correlationId: context.correlationId,
      requestPath: new URL(request.url).pathname,
      fallbackStrategy,
      fallbackActiveMs,
      alertAfterMs,
      repeatMs,
      hasLastRealSnapshot,
      upstreamDurationMs: context.metrics.upstreamDurationMs ?? null,
      totalDurationMs: Math.max(0, Date.now() - context.startedAt),
    },
  })
  state.lastAlertedAt = Date.now()
}

async function getMarketSnapshot(req: Request, context: ApiRouteContext) {
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
    return NextResponse.json(cached.data, {
      headers: {
        'x-aljama-market-source': cached.data.source,
      },
    })
  }

  const upstreamStartedAt = Date.now()
  try {
    const snapshot = await buildSnapshot()
    context.metrics.upstreamDurationMs = Math.max(0, Date.now() - upstreamStartedAt)
    globalForMarket.aljamaMarketCache = {
      data: snapshot,
      expiresAt: Date.now() + CACHE_TTL_MS,
    }
    globalForMarket.aljamaLastMarketSnapshot = snapshot
    const fallbackState = getFallbackState()
    if (fallbackState.activeSince !== null) {
      logInfo('market-snapshot', 'Recovered from fallback mode', {
        provider: 'coingecko',
        requestId: context.requestId,
        correlationId: context.correlationId,
        requestPath: new URL(request.url).pathname,
        fallbackActiveMs: Math.max(0, Date.now() - fallbackState.activeSince),
        upstreamDurationMs: context.metrics.upstreamDurationMs,
        totalDurationMs: Math.max(0, Date.now() - context.startedAt),
      })
      fallbackState.activeSince = null
      fallbackState.lastAlertedAt = null
    }
    return NextResponse.json(snapshot, {
      headers: {
        'x-aljama-market-source': snapshot.source,
      },
    })
  } catch (error) {
    context.metrics.upstreamDurationMs = Math.max(0, Date.now() - upstreamStartedAt)
    const lastRealSnapshot = globalForMarket.aljamaLastMarketSnapshot
    const fallbackSnapshot = lastRealSnapshot
      ? {
          ...lastRealSnapshot,
          source: 'fallback' as const,
        }
      : buildSeededFallbackSnapshot()
    const fallbackStrategy = lastRealSnapshot ? 'last_real_snapshot' : 'seeded_snapshot'
    const fallbackState = getFallbackState()
    if (fallbackState.activeSince === null) {
      fallbackState.activeSince = Date.now()
      fallbackState.lastAlertedAt = null
    }
    const fallbackActiveMs = Math.max(0, Date.now() - fallbackState.activeSince)

    logWarn('market-snapshot', error, {
      provider: 'coingecko',
      assetCount: ASSETS.length,
      requestPath: new URL(request.url).pathname,
      requestId: context.requestId,
      correlationId: context.correlationId,
      fallbackStrategy,
      fallbackSource: fallbackSnapshot.source,
      fallbackUpdatedAt: fallbackSnapshot.updatedAt,
      fallbackActiveMs,
      hasLastRealSnapshot: Boolean(lastRealSnapshot),
      upstreamDurationMs: context.metrics.upstreamDurationMs,
      totalDurationMs: Math.max(0, Date.now() - context.startedAt),
    })

    try {
      await maybeEmitFallbackModeAlert(
        request,
        context,
        fallbackStrategy,
        fallbackActiveMs,
        Boolean(lastRealSnapshot),
      )
    } catch (alertError) {
      logError('market-snapshot:alert', alertError, {
        requestId: context.requestId,
        correlationId: context.correlationId,
        fallbackStrategy,
        fallbackActiveMs,
      })
    }

    globalForMarket.aljamaMarketCache = {
      data: fallbackSnapshot,
      expiresAt: Date.now() + CACHE_TTL_MS,
    }
    return NextResponse.json(fallbackSnapshot, {
      headers: {
        'cache-control': 'no-store, max-age=0',
        'x-aljama-market-source': fallbackSnapshot.source,
      },
    })
  }
}

export const GET = withApiRoute({ scope: 'api:market-snapshot', timeoutMs: 12_000 }, getMarketSnapshot)
