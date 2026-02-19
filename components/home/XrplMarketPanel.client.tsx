// components/home/XrplMarketPanel.client.tsx
'use client'

import { useCallback, useEffect, useId, useMemo, useState, type WheelEvent } from 'react'
import { motion } from 'framer-motion'
import { useComponentTelemetry } from '@/infra/telemetry/useComponentTelemetry'
import { useTranslations } from 'next-intl'
import { useSession } from 'next-auth/react'
import { formatTime24 } from '@/lib/time-format'

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

const COLORS: Record<string, string> = {
  XRP: '#7a5cff',
  BTC: '#f7931a',
  ETH: '#627eea',
  USDC: '#2775ca',
  EURC: '#f4c542',
}

type ViewOption = 'all' | 'xrpl' | 'reference'
type TimelineTick = { index: number; timestamp: number }
type ZoomWindow = { start: number; end: number }

const CHART_WIDTH = 100
const CHART_HEIGHT = 48
const CHART_PADDING = 4

function normalizeSeries(series: number[]): number[] {
  if (series.length === 0) return []
  const first = series[0] ?? 1
  const safeFirst = first === 0 ? 1 : first
  return series.map((value) => value / safeFirst)
}

function buildPath(series: number[], min: number, max: number, startIndex: number, endIndex: number) {
  if (series.length < 2 || endIndex <= startIndex) return ''
  const safeStart = Math.min(Math.max(startIndex, 0), series.length - 2)
  const safeEnd = Math.min(Math.max(endIndex, safeStart + 1), series.length - 1)
  const span = max - min || 1
  const indexSpan = safeEnd - safeStart
  const points = series.slice(safeStart, safeEnd + 1)
  return points
    .map((value, offset) => {
      const x = (offset / indexSpan) * CHART_WIDTH
      const y =
        CHART_HEIGHT -
        CHART_PADDING -
        ((value - min) / span) * (CHART_HEIGHT - CHART_PADDING * 2)
      return `${offset === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')
}

function formatUsd(value: number) {
  if (!Number.isFinite(value)) return '--'
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value < 1 ? 4 : 2,
  })
}

function formatTimelineDate(timestamp: number, zoomed: boolean) {
  return new Intl.DateTimeFormat('en-US', zoomed
    ? { weekday: 'short', month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric' }).format(timestamp)
}

function formatPointAtDate(timestamp: number) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: '2-digit',
  }).format(timestamp)
}

function seriesIndexToTimestamp(updatedAt: string | null | undefined, index: number, pointCount: number): number | null {
  if (!updatedAt || pointCount < 2) return null
  const end = new Date(updatedAt).getTime()
  if (!Number.isFinite(end)) return null
  const start = end - 30 * 24 * 60 * 60 * 1_000
  const ratio = Math.min(Math.max(index / (pointCount - 1), 0), 1)
  return Math.round(start + ratio * (end - start))
}

function buildTimelineTicks(
  updatedAt: string | null | undefined,
  pointCount: number,
  startIndex: number,
  endIndex: number,
): TimelineTick[] {
  if (!updatedAt || pointCount < 2) return []
  const safeStart = Math.max(startIndex, 0)
  const safeEnd = Math.min(endIndex, pointCount - 1)
  const span = safeEnd - safeStart
  if (span < 1) return []
  const indexes = Array.from(
    new Set([
      safeStart,
      Math.round(safeStart + span / 3),
      Math.round(safeStart + (span * 2) / 3),
      safeEnd,
    ]),
  )
  return indexes
    .map((index) => {
      const timestamp = seriesIndexToTimestamp(updatedAt, index, pointCount)
      if (!timestamp) return null
      return { index, timestamp }
    })
    .filter((tick): tick is TimelineTick => tick !== null)
}

export default function XrplMarketPanel() {
  useComponentTelemetry('XrplMarketPanel')
  const t = useTranslations('market')
  const tAuth = useTranslations('auth')
  const { status: sessionStatus } = useSession()
  const locked = sessionStatus === 'unauthenticated'
  const chartClipId = useId().replace(/:/g, '')
  const [state, setState] = useState<{
    loading: boolean
    error: string | null
    snapshot: MarketSnapshot | null
    view: ViewOption
  }>({
    loading: true,
    error: null,
    snapshot: null,
    view: 'all',
  })
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const [zoomWindow, setZoomWindow] = useState<ZoomWindow | null>(null)

  const loadSnapshot = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }))
    try {
      const res = await fetch('/api/market-snapshot')
      if (!res.ok) throw new Error('Market snapshot unavailable')
      const body = (await res.json()) as MarketSnapshot
      setState((prev) => ({
        ...prev,
        loading: false,
        snapshot: body,
        error: null,
      }))
    } catch (error) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Market snapshot unavailable',
      }))
    }
  }, [])

  useEffect(() => {
    void loadSnapshot()
  }, [loadSnapshot])

  const visibleAssets = useMemo(() => {
    if (!state.snapshot) return []
    if (state.view === 'all') return state.snapshot.assets
    return state.snapshot.assets.filter((asset) => asset.marketGroup === state.view)
  }, [state.snapshot, state.view])

  const normalizedSeries = useMemo(
    () =>
      visibleAssets.map((asset) => ({
        symbol: asset.symbol,
        color: COLORS[asset.symbol] ?? '#ffffff',
        series: normalizeSeries(asset.series),
      })),
    [visibleAssets],
  )

  const pointCount = useMemo(
    () => Math.max(0, ...normalizedSeries.map((asset) => asset.series.length)),
    [normalizedSeries],
  )

  const chartWindow = useMemo(() => {
    const maxIndex = Math.max(pointCount - 1, 0)
    if (maxIndex < 1) return { start: 0, end: 0, isZoomed: false }
    if (!zoomWindow) return { start: 0, end: maxIndex, isZoomed: false }
    const start = Math.min(Math.max(zoomWindow.start, 0), maxIndex - 1)
    const end = Math.min(Math.max(zoomWindow.end, start + 1), maxIndex)
    return { start, end, isZoomed: start > 0 || end < maxIndex }
  }, [pointCount, zoomWindow])

  const normalizedRange = useMemo(() => {
    const values = normalizedSeries.flatMap((asset) => {
      const safeStart = Math.min(chartWindow.start, asset.series.length - 1)
      const safeEnd = Math.min(chartWindow.end, asset.series.length - 1)
      if (safeStart < 0 || safeEnd < safeStart) return []
      return asset.series.slice(safeStart, safeEnd + 1)
    })
    const min = values.length ? Math.min(...values) : 0.9
    const max = values.length ? Math.max(...values) : 1.1
    return { min, max }
  }, [chartWindow.end, chartWindow.start, normalizedSeries])

  useEffect(() => {
    setZoomWindow((prev) => {
      if (!prev) return null
      const maxIndex = Math.max(pointCount - 1, 0)
      if (maxIndex < 1) return null
      const start = Math.min(Math.max(prev.start, 0), maxIndex - 1)
      const end = Math.min(Math.max(prev.end, start + 1), maxIndex)
      if (start === 0 && end === maxIndex) return null
      if (start === prev.start && end === prev.end) return prev
      return { start, end }
    })
    setHoverIndex((prev) => {
      if (prev === null) return null
      if (pointCount < 1) return null
      return Math.min(prev, pointCount - 1)
    })
  }, [pointCount])

  const onChartWheel = useCallback(
    (event: WheelEvent<SVGSVGElement>) => {
      if (pointCount < 4) return
      if (!event.deltaY) return
      event.preventDefault()

      const maxIndex = pointCount - 1
      const currentStart = chartWindow.start
      const currentEnd = chartWindow.end
      const currentSpan = currentEnd - currentStart
      if (currentSpan < 1) return

      const rect = event.currentTarget.getBoundingClientRect()
      if (!rect.width) return

      const ratio = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1)
      const zoomIn = event.deltaY < 0
      const minSpan = Math.min(Math.max(5, Math.floor(maxIndex * 0.1)), maxIndex)
      const nextSpanUnclamped = Math.round(currentSpan * (zoomIn ? 0.82 : 1.2))
      const nextSpan = Math.min(Math.max(nextSpanUnclamped, minSpan), maxIndex)

      if (nextSpan >= maxIndex) {
        setZoomWindow(null)
        return
      }

      const anchorIndex = currentStart + ratio * currentSpan
      let nextStart = Math.round(anchorIndex - ratio * nextSpan)
      let nextEnd = nextStart + nextSpan

      if (nextStart < 0) {
        nextStart = 0
        nextEnd = nextSpan
      } else if (nextEnd > maxIndex) {
        nextEnd = maxIndex
        nextStart = maxIndex - nextSpan
      }

      setZoomWindow({ start: nextStart, end: nextEnd })
    },
    [chartWindow.end, chartWindow.start, pointCount],
  )

  const timelineTicks = useMemo(
    () => buildTimelineTicks(state.snapshot?.updatedAt, pointCount, chartWindow.start, chartWindow.end),
    [chartWindow.end, chartWindow.start, state.snapshot?.updatedAt, pointCount],
  )

  const hoverSnapshot = useMemo(() => {
    if (hoverIndex === null || !state.snapshot || pointCount < 2) return null
    if (hoverIndex < chartWindow.start || hoverIndex > chartWindow.end) return null
    const timestamp = seriesIndexToTimestamp(state.snapshot.updatedAt, hoverIndex, pointCount)
    if (!timestamp) return null
    return {
      timestamp,
      rows: visibleAssets.map((asset) => {
        const safeIndex = Math.min(hoverIndex, Math.max(asset.series.length - 1, 0))
        const pointPrice = asset.series[safeIndex] ?? asset.priceUsd
        const explicitName = asset.symbol === 'XRP' ? 'Ripple' : asset.name
        return { ...asset, pointPrice, explicitName }
      }),
    }
  }, [chartWindow.end, chartWindow.start, hoverIndex, pointCount, state.snapshot, visibleAssets])

  const viewOptions = [
    { id: 'all', label: t('viewAll') },
    { id: 'xrpl', label: t('viewXrpl') },
    { id: 'reference', label: t('viewReference') },
  ] as const

  const indexFromClientX = useCallback(
    (clientX: number, rect: DOMRect) => {
      if (!rect.width || chartWindow.end <= chartWindow.start) return null
      const ratio = (clientX - rect.left) / rect.width
      const clamped = Math.min(Math.max(ratio, 0), 1)
      return Math.round(chartWindow.start + clamped * (chartWindow.end - chartWindow.start))
    },
    [chartWindow.end, chartWindow.start],
  )

  const hoverPoints = useMemo(() => {
    if (
      hoverIndex === null ||
      chartWindow.end <= chartWindow.start ||
      hoverIndex < chartWindow.start ||
      hoverIndex > chartWindow.end
    ) {
      return []
    }

    const x = ((hoverIndex - chartWindow.start) / (chartWindow.end - chartWindow.start)) * CHART_WIDTH
    const span = normalizedRange.max - normalizedRange.min || 1

    return normalizedSeries
      .map((asset) => {
        const safeIndex = Math.min(hoverIndex, Math.max(asset.series.length - 1, 0))
        const value = asset.series[safeIndex]
        if (!Number.isFinite(value)) return null
        const y =
          CHART_HEIGHT -
          CHART_PADDING -
          ((value - normalizedRange.min) / span) * (CHART_HEIGHT - CHART_PADDING * 2)
        return { key: asset.symbol, color: asset.color, x, y }
      })
      .filter((point): point is { key: string; color: string; x: number; y: number } => point !== null)
  }, [
    chartWindow.end,
    chartWindow.start,
    hoverIndex,
    normalizedRange.max,
    normalizedRange.min,
    normalizedSeries,
  ])

  const moveHoverIndex = useCallback(
    (delta: number) => {
      if (pointCount < 2) return
      setHoverIndex((prev) => {
        const base = prev === null ? chartWindow.start : prev
        return Math.min(Math.max(base + delta, chartWindow.start), chartWindow.end)
      })
    },
    [chartWindow.end, chartWindow.start, pointCount],
  )

  return (
    <section className="surface-panel panel-glow-rose relative p-7 sm:p-8">
      <div className="absolute inset-x-8 top-5 ornament-line" />

      <header className="relative flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-saffron/70">{t('eyebrow')}</p>
          <h2 className="mt-3 font-display text-2xl font-semibold text-ivory sm:text-3xl">
            {t('title')}
          </h2>
          <p className="text-sm text-ivory/70">{t('body')}</p>
        </div>
        <span className="rounded-full bg-white/5 px-3 py-1 text-xs font-semibold tracking-wide text-ivory/70">
          {state.snapshot?.source === 'fallback' ? t('badgeFallback') : t('badgeLive')}
        </span>
      </header>

      <div className="relative mt-6 space-y-5">
        <div className="flex flex-wrap items-center gap-2 text-xs text-ivory/60">
          {viewOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setState((prev) => ({ ...prev, view: option.id }))}
              disabled={locked}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                state.view === option.id
                  ? 'border-saffron/60 bg-saffron/10 text-saffron'
                  : 'border-white/10 bg-white/5 text-ivory/60 hover:border-white/20'
              }`}
            >
              {option.label}
            </button>
          ))}
          <span className="ml-auto text-[11px] text-ivory/40">
            {state.snapshot?.updatedAt
              ? `${t('updated')} ${formatTime24(state.snapshot.updatedAt)}`
              : ''}
          </span>
        </div>

        <div className="surface-inner p-4">
          {state.loading ? (
            <p className="text-sm text-ivory/60">{t('loading')}</p>
          ) : state.error ? (
            <p className="text-sm text-red-300">{state.error}</p>
          ) : (
            <div className="space-y-4">
              <div className="-mx-2 sm:-mx-3 lg:-mx-4">
                <svg
                  viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
                  className="h-44 w-[calc(100%+1rem)] md:h-52 md:w-[calc(100%+1.5rem)] lg:w-[calc(100%+2rem)]"
                  tabIndex={0}
                  role="img"
                  aria-label="Market trend chart"
                  onMouseMove={(event) => {
                    if (pointCount < 2) return
                    const rect = event.currentTarget.getBoundingClientRect()
                    const next = indexFromClientX(event.clientX, rect)
                    if (next === null) return
                    setHoverIndex(next)
                  }}
                  onClick={(event) => {
                    if (pointCount < 2) return
                    const rect = event.currentTarget.getBoundingClientRect()
                    const next = indexFromClientX(event.clientX, rect)
                    if (next === null) return
                    setHoverIndex(next)
                  }}
                  onFocus={() => {
                    if (pointCount < 2) return
                    setHoverIndex((prev) => prev ?? chartWindow.start)
                  }}
                  onKeyDown={(event) => {
                    if (pointCount < 2) return
                    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
                      event.preventDefault()
                      moveHoverIndex(1)
                      return
                    }
                    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
                      event.preventDefault()
                      moveHoverIndex(-1)
                      return
                    }
                    if (event.key === 'Home') {
                      event.preventDefault()
                      setHoverIndex(chartWindow.start)
                      return
                    }
                    if (event.key === 'End') {
                      event.preventDefault()
                      setHoverIndex(chartWindow.end)
                    }
                  }}
                  onWheel={onChartWheel}
                  onDoubleClick={() => setZoomWindow(null)}
                >
                  <defs>
                    <linearGradient id="marketGlow" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#6fa0d9" stopOpacity="0.35" />
                      <stop offset="50%" stopColor="#e0bf7f" stopOpacity="0.35" />
                      <stop offset="100%" stopColor="#4b9577" stopOpacity="0.35" />
                    </linearGradient>
                    <clipPath id={chartClipId}>
                      <rect
                        x={0}
                        y={CHART_PADDING}
                        width={CHART_WIDTH}
                        height={CHART_HEIGHT - CHART_PADDING * 2}
                      />
                    </clipPath>
                  </defs>
                  <rect
                    x="0"
                    y="0"
                    width={CHART_WIDTH}
                    height={CHART_HEIGHT}
                    fill="url(#marketGlow)"
                    opacity="0.08"
                  />
                  <g clipPath={`url(#${chartClipId})`}>
                    {normalizedSeries.map((asset) => {
                      const path = buildPath(
                        asset.series,
                        normalizedRange.min,
                        normalizedRange.max,
                        chartWindow.start,
                        chartWindow.end,
                      )
                      if (!path) return null
                      return (
                        <path
                          key={asset.symbol}
                          d={path}
                          fill="none"
                          stroke={asset.color}
                          strokeWidth="1.6"
                          opacity="0.9"
                        />
                      )
                    })}
                    {hoverPoints.map((point) => (
                      <g key={`hover-${point.key}`}>
                        <circle
                          cx={point.x}
                          cy={point.y}
                          r="1.35"
                          fill={point.color}
                          stroke="rgba(255,255,255,0.92)"
                          strokeWidth="0.38"
                        />
                        <circle
                          cx={point.x}
                          cy={point.y}
                          r="2.1"
                          fill="none"
                          stroke={point.color}
                          strokeOpacity="0.55"
                          strokeWidth="0.28"
                        />
                      </g>
                    ))}
                  </g>
                </svg>
              </div>

              {timelineTicks.length > 0 ? (
                <div className="grid grid-cols-4 gap-2 text-[10px] text-ivory/45">
                  {timelineTicks.map((tick, index) => (
                    <div
                      key={`${tick.index}-${tick.timestamp}`}
                      className={`flex flex-col ${index === timelineTicks.length - 1 ? 'items-end' : 'items-start'}`}
                    >
                      <span>{formatTimelineDate(tick.timestamp, chartWindow.isZoomed)}</span>
                    </div>
                  ))}
                </div>
              ) : null}

              {chartWindow.isZoomed ? (
                <p className="text-[10px] uppercase tracking-[0.14em] text-ivory/40">
                  {t('zoomReset')}
                </p>
              ) : null}

              <div className="flex flex-wrap items-center gap-3 text-xs text-ivory/60">
                {visibleAssets.map((asset) => (
                  <span key={asset.id} className="inline-flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: COLORS[asset.symbol] ?? '#ffffff' }}
                    />
                    {(asset.symbol === 'XRP' ? 'Ripple' : asset.name)} ({asset.symbol})
                  </span>
                ))}
              </div>

              {hoverSnapshot ? (
                <div className="surface-soft rounded-2xl border border-white/10 p-3 text-[11px] text-ivory/75">
                  <p className="font-semibold uppercase tracking-[0.16em] text-ivory/55">
                    {t('pointAt')} {formatPointAtDate(hoverSnapshot.timestamp)}
                  </p>
                  <div className="mt-2 space-y-1.5">
                    {hoverSnapshot.rows.map((asset) => (
                      <div key={`${asset.id}-${hoverSnapshot.timestamp}`} className="flex items-center justify-between gap-3">
                        <span className="truncate text-ivory/65">
                          {asset.marketGroup === 'xrpl' ? t('table.xrpl') : t('table.reference')} · {asset.explicitName} ({asset.symbol})
                        </span>
                        <span className="font-semibold text-ivory">{formatUsd(asset.pointPrice)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-ivory/45">{t('hoverHint')}</p>
              )}
            </div>
          )}
        </div>

        <div className="surface-soft p-4 text-sm text-ivory/70">
          <div className="grid grid-cols-4 gap-3 text-xs uppercase tracking-wide text-ivory/50">
            <span>{t('table.asset')}</span>
            <span>{t('table.price')}</span>
            <span>{t('table.change')}</span>
            <span>{t('table.network')}</span>
          </div>
          <div className="mt-3 space-y-2">
            {visibleAssets.map((asset) => (
              <div key={asset.id} className="grid grid-cols-4 gap-3">
                <span className="font-medium text-ivory">{asset.symbol}</span>
                <span>{formatUsd(asset.priceUsd)}</span>
                <span className={asset.change24h >= 0 ? 'text-emerald-200' : 'text-red-300'}>
                  {asset.change24h >= 0 ? '+' : ''}
                  {asset.change24h.toFixed(2)}%
                </span>
                <span className="text-ivory/60">
                  {asset.network}
                </span>
              </div>
            ))}
          </div>
        </div>

        <motion.button
          type="button"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          disabled={locked}
          onClick={() => void loadSnapshot()}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#e0bf7f] via-[#cc945f] to-[#b26a49] px-5 py-3 text-base font-semibold tracking-wide text-ivory shadow-lg shadow-[#b26a49]/30 transition focus:outline-none focus:ring-2 focus:ring-saffron/40 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {t('refresh')}
        </motion.button>

        {locked && (
          <p className="text-xs uppercase tracking-[0.18em] text-ivory/50">
            {tAuth('unlockActions')}
          </p>
        )}
      </div>
    </section>
  )
}
