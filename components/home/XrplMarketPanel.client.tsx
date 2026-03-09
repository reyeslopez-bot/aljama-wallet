// components/home/XrplMarketPanel.client.tsx
'use client'

import { useCallback, useEffect, useId, useMemo, useState, type KeyboardEvent, type WheelEvent } from 'react'
import { useComponentTelemetry } from '@/infra/telemetry/useComponentTelemetry'
import { useLocale, useTranslations } from 'next-intl'
import { useSession } from 'next-auth/react'
import UnlockActionsLink from '@/components/ui/UnlockActionsLink.client'
import { useGsapPressable } from '@/hooks/useGsapPressable'
import { getHomeNowMs } from '@/components/home/homeClock'

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

type AssetPalette = {
  stroke: string
  fillStart: string
  fillEnd: string
  chipActiveBg: string
  chipBorder: string
}

const ASSET_PALETTES: Record<string, AssetPalette> = {
  XRP: {
    stroke: '#6d5be2',
    fillStart: 'rgba(109,91,226,0.5)',
    fillEnd: 'rgba(109,91,226,0)',
    chipActiveBg: 'rgba(109,91,226,0.22)',
    chipBorder: 'rgba(178,167,250,0.8)',
  },
  BTC: {
    stroke: '#f7931a',
    fillStart: 'rgba(247,147,26,0.45)',
    fillEnd: 'rgba(247,147,26,0)',
    chipActiveBg: 'rgba(247,147,26,0.2)',
    chipBorder: 'rgba(255,195,113,0.85)',
  },
  ETH: {
    stroke: '#627eea',
    fillStart: 'rgba(98,126,234,0.45)',
    fillEnd: 'rgba(98,126,234,0)',
    chipActiveBg: 'rgba(98,126,234,0.22)',
    chipBorder: 'rgba(162,178,246,0.85)',
  },
  USDC: {
    stroke: '#2775ca',
    fillStart: 'rgba(39,117,202,0.42)',
    fillEnd: 'rgba(39,117,202,0)',
    chipActiveBg: 'rgba(39,117,202,0.22)',
    chipBorder: 'rgba(120,179,236,0.8)',
  },
  EURC: {
    stroke: '#f4c542',
    fillStart: 'rgba(244,197,66,0.45)',
    fillEnd: 'rgba(244,197,66,0)',
    chipActiveBg: 'rgba(244,197,66,0.24)',
    chipBorder: 'rgba(255,226,149,0.9)',
  },
}

type ViewOption = 'all' | 'xrpl' | 'reference'
type TimelineTick = { index: number; timestamp: number }
type TimelineMarker = TimelineTick & { position: number }
type ZoomWindow = { start: number; end: number }

const CHART_WIDTH = 100
const CHART_HEIGHT = 48
const PLOT_INSET_X = 3
const PLOT_INSET_Y = 4
const PLOT_RANGE_PADDING_RATIO = 0.08
const MIN_PLOT_RANGE_PADDING = 0.015

function paletteForSymbol(symbol: string): AssetPalette {
  return (
    ASSET_PALETTES[symbol] ?? {
      stroke: '#e4e7ec',
      fillStart: 'rgba(228,231,236,0.25)',
      fillEnd: 'rgba(228,231,236,0)',
      chipActiveBg: 'rgba(228,231,236,0.2)',
      chipBorder: 'rgba(228,231,236,0.7)',
    }
  )
}

function normalizeSeries(series: number[]): number[] {
  if (series.length === 0) return []
  const first = series[0] ?? 1
  const safeFirst = first === 0 ? 1 : first
  return series.map((value) => value / safeFirst)
}

function displayNameForAsset(asset: Pick<MarketAsset, 'symbol' | 'name'>) {
  return asset.symbol === 'XRP' ? 'Ripple' : asset.name
}

type ChartPoint = {
  x: number
  y: number
}

type PlotFrame = {
  x: number
  y: number
  width: number
  height: number
}

function getPlotFrame(chartWidth: number): PlotFrame {
  return {
    x: PLOT_INSET_X,
    y: PLOT_INSET_Y,
    width: Math.max(chartWidth - PLOT_INSET_X * 2, 1),
    height: Math.max(CHART_HEIGHT - PLOT_INSET_Y * 2, 1),
  }
}

function buildPaddedRange(values: number[]) {
  if (values.length === 0) return { min: 0.9, max: 1.1 }

  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min
  const padding =
    span > 0
      ? Math.max(span * PLOT_RANGE_PADDING_RATIO, MIN_PLOT_RANGE_PADDING)
      : Math.max(Math.abs(max || 1) * PLOT_RANGE_PADDING_RATIO, MIN_PLOT_RANGE_PADDING)

  return { min: min - padding, max: max + padding }
}

function projectValueToChartY(value: number, min: number, max: number) {
  const span = max - min || 1
  const plotHeight = Math.max(CHART_HEIGHT - PLOT_INSET_Y * 2, 1)
  const normalized = Math.min(Math.max((value - min) / span, 0), 1)
  return PLOT_INSET_Y + (1 - normalized) * plotHeight
}

function buildChartPoints(
  series: number[],
  min: number,
  max: number,
  startIndex: number,
  endIndex: number,
  chartWidth: number,
): ChartPoint[] {
  if (series.length < 2 || endIndex <= startIndex) return []
  const safeStart = Math.min(Math.max(startIndex, 0), series.length - 2)
  const safeEnd = Math.min(Math.max(endIndex, safeStart + 1), series.length - 1)
  const indexSpan = safeEnd - safeStart
  const points = series.slice(safeStart, safeEnd + 1)
  const plotFrame = getPlotFrame(chartWidth)
  return points.map((value, offset) => {
    const x = plotFrame.x + (offset / indexSpan) * plotFrame.width
    const y = projectValueToChartY(value, min, max)
    return { x, y }
  })
}

function buildLinePath(
  series: number[],
  min: number,
  max: number,
  startIndex: number,
  endIndex: number,
  chartWidth: number,
) {
  const points = buildChartPoints(series, min, max, startIndex, endIndex, chartWidth)
  if (points.length < 2) return ''
  return points
    .map((point, offset) => `${offset === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ')
}

function buildAreaPath(
  series: number[],
  min: number,
  max: number,
  startIndex: number,
  endIndex: number,
  chartWidth: number,
) {
  const points = buildChartPoints(series, min, max, startIndex, endIndex, chartWidth)
  if (points.length < 2) return ''
  const plotFrame = getPlotFrame(chartWidth)
  const baseY = plotFrame.y + plotFrame.height
  const head = points
    .map((point) => `L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ')
  const first = points[0]
  const last = points[points.length - 1]
  return `M ${first.x.toFixed(2)} ${baseY.toFixed(2)} ${head} L ${last.x.toFixed(2)} ${baseY.toFixed(2)} Z`
}

function formatUsd(value: number, locale: string) {
  if (!Number.isFinite(value)) return '--'
  return value.toLocaleString(locale, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value < 1 ? 4 : 2,
  })
}

function formatPercentChange(value: number, locale: string) {
  if (!Number.isFinite(value)) return '--'
  const formatted = Math.abs(value).toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  if (value > 0) return `+${formatted}%`
  if (value < 0) return `-${formatted}%`
  return `${formatted}%`
}

function formatUpdatedTimeAgo(updatedAt: string, locale: string, nowMs: number): string {
  const updated = new Date(updatedAt).getTime()
  if (!Number.isFinite(updated)) return ''

  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  const diffMs = Math.max(nowMs - updated, 0)
  const totalMinutes = Math.floor(diffMs / (60 * 1_000)) || 0

  if (totalMinutes < 60) {
    const minutes = Math.max(totalMinutes, 1)
    return formatter.format(-minutes, 'minute')
  }

  if (totalMinutes < 24 * 60) {
    const hours = Math.max(Math.floor(totalMinutes / 60), 1)
    return formatter.format(-hours, 'hour')
  }

  const days = Math.max(Math.floor(totalMinutes / (24 * 60)), 1)
  return formatter.format(-days, 'day')
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
  targetTickCount: number,
): TimelineTick[] {
  if (!updatedAt || pointCount < 2) return []
  const safeStart = Math.max(startIndex, 0)
  const safeEnd = Math.min(endIndex, pointCount - 1)
  const span = safeEnd - safeStart
  if (span < 1) return []
  const safeTickCount = Math.min(Math.max(targetTickCount, 2), span + 1)
  const indexes = Array.from(
    new Set(
      Array.from({ length: safeTickCount }, (_, offset) =>
        Math.round(safeStart + (span * offset) / (safeTickCount - 1)),
      ),
    ),
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
  const locale = useLocale()
  const { status: sessionStatus } = useSession()
  const currentTimeMs = getHomeNowMs()
  const locked = sessionStatus === 'unauthenticated'
  const chartClipId = useId().replace(/:/g, '')
  const titleId = `${chartClipId}-title`
  const bodyId = `${chartClipId}-body`
  const viewFiltersId = `${chartClipId}-filters`
  const chartLabelId = `${chartClipId}-chart-label`
  const chartInstructionsId = `${chartClipId}-chart-instructions`
  const chartLiveStatusId = `${chartClipId}-chart-live-status`
  const chartControlsId = `${chartClipId}-chart-controls`
  const tableLabelId = `${chartClipId}-table-label`
  const [chartSvgNode, setChartSvgNode] = useState<SVGSVGElement | null>(null)
  const [chartViewportWidth, setChartViewportWidth] = useState(CHART_WIDTH)
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
  const [focusSymbol, setFocusSymbol] = useState<string | null>(null)
  const refreshButton = useGsapPressable<HTMLButtonElement>({
    hover: { scale: 1.02 },
    press: { scale: 0.98 },
    respectReducedMotion: true,
  })

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

  useEffect(() => {
    if (!chartSvgNode) return

    const updateChartViewportWidth = () => {
      const rect = chartSvgNode.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      const nextWidth = Number(((rect.width / rect.height) * CHART_HEIGHT).toFixed(2))
      setChartViewportWidth((prev) => (Math.abs(prev - nextWidth) < 0.25 ? prev : nextWidth))
    }

    updateChartViewportWidth()

    if (typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(() => updateChartViewportWidth())
    observer.observe(chartSvgNode)

    return () => observer.disconnect()
  }, [chartSvgNode])

  const visibleAssets = useMemo(() => {
    if (!state.snapshot) return []
    if (state.view === 'all') return state.snapshot.assets
    return state.snapshot.assets.filter((asset) => asset.marketGroup === state.view)
  }, [state.snapshot, state.view])

  const normalizedSeries = useMemo(
    () =>
      visibleAssets.map((asset) => ({
        symbol: asset.symbol,
        name: asset.name,
        marketGroup: asset.marketGroup,
        palette: paletteForSymbol(asset.symbol),
        series: normalizeSeries(asset.series),
      })),
    [visibleAssets],
  )

  useEffect(() => {
    setFocusSymbol((prev) => {
      if (!visibleAssets.length) return null
      if (prev && visibleAssets.some((asset) => asset.symbol === prev)) return prev
      return visibleAssets[0]?.symbol ?? null
    })
  }, [visibleAssets])

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
    return buildPaddedRange(values)
  }, [chartWindow.end, chartWindow.start, normalizedSeries])

  const plotFrame = useMemo(() => getPlotFrame(chartViewportWidth), [chartViewportWidth])

  const areaFillAsset = useMemo(
    () => normalizedSeries.find((asset) => asset.symbol === 'EURC') ?? normalizedSeries[0] ?? null,
    [normalizedSeries],
  )

  const areaFillPath = useMemo(() => {
    if (!areaFillAsset) return ''
    return buildAreaPath(
      areaFillAsset.series,
      normalizedRange.min,
      normalizedRange.max,
      chartWindow.start,
      chartWindow.end,
      chartViewportWidth,
    )
  }, [areaFillAsset, chartViewportWidth, chartWindow.end, chartWindow.start, normalizedRange.max, normalizedRange.min])

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

  const timelineTicks = useMemo(
    () =>
      buildTimelineTicks(
        state.snapshot?.updatedAt,
        pointCount,
        chartWindow.start,
        chartWindow.end,
        chartViewportWidth >= 132 ? (chartWindow.isZoomed ? 6 : 5) : chartViewportWidth >= 96 ? 4 : 3,
      ),
    [chartViewportWidth, chartWindow.end, chartWindow.isZoomed, chartWindow.start, state.snapshot?.updatedAt, pointCount],
  )
  const timelineMarkers = useMemo<TimelineMarker[]>(() => {
    const span = chartWindow.end - chartWindow.start
    if (span < 1) return []
    return timelineTicks.map((tick) => ({
      ...tick,
      position: ((tick.index - chartWindow.start) / span) * 100,
    }))
  }, [chartWindow.end, chartWindow.start, timelineTicks])

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
        const explicitName = displayNameForAsset(asset)
        return { ...asset, pointPrice, explicitName }
      }),
    }
  }, [chartWindow.end, chartWindow.start, hoverIndex, pointCount, state.snapshot, visibleAssets])

  const displayedRange = useMemo(() => {
    if (!state.snapshot || pointCount < 2) return null
    const start = seriesIndexToTimestamp(state.snapshot.updatedAt, chartWindow.start, pointCount)
    const end = seriesIndexToTimestamp(state.snapshot.updatedAt, chartWindow.end, pointCount)
    if (!start || !end) return null
    return { start, end }
  }, [chartWindow.end, chartWindow.start, pointCount, state.snapshot])

  const viewOptions = useMemo(
    () =>
      [
        { id: 'all', label: t('viewAll') },
        { id: 'xrpl', label: t('viewXrpl') },
        { id: 'reference', label: t('viewReference') },
      ] as const,
    [t],
  )
  const chartMaxIndex = Math.max(pointCount - 1, 0)
  const minZoomSpan = useMemo(() => {
    if (chartMaxIndex < 1) return 0
    return Math.min(Math.max(5, Math.floor(chartMaxIndex * 0.1)), chartMaxIndex)
  }, [chartMaxIndex])
  const canZoomIn = pointCount >= 4 && chartWindow.end - chartWindow.start > minZoomSpan
  const canZoomOut = chartWindow.isZoomed
  const viewOptionId = useCallback((optionId: ViewOption) => `${chartClipId}-view-${optionId}`, [chartClipId])
  const seriesOptionId = useCallback((symbol: string) => `${chartClipId}-series-${symbol}`, [chartClipId])
  const timelineDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        month: 'short',
        day: 'numeric',
      }),
    [locale],
  )
  const zoomedTimelineDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }),
    [locale],
  )
  const pointAtDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        weekday: 'short',
        month: 'short',
        day: '2-digit',
      }),
    [locale],
  )

  const indexFromClientX = useCallback(
    (clientX: number, rect: DOMRect) => {
      if (!rect.width || chartWindow.end <= chartWindow.start) return null
      const ratio = (clientX - rect.left) / rect.width
      const clamped = Math.min(Math.max(ratio, 0), 1)
      return Math.round(chartWindow.start + clamped * (chartWindow.end - chartWindow.start))
    },
    [chartWindow.end, chartWindow.start],
  )

  const zoomChart = useCallback(
    (direction: 'in' | 'out', anchorIndex?: number | null) => {
      if (pointCount < 4) return

      const currentStart = chartWindow.start
      const currentEnd = chartWindow.end
      const currentSpan = currentEnd - currentStart
      if (currentSpan < 1) return

      const safeAnchorIndex = anchorIndex ?? Math.round((currentStart + currentEnd) / 2)
      const ratio = Math.min(Math.max((safeAnchorIndex - currentStart) / currentSpan, 0), 1)
      const nextSpanUnclamped = Math.round(currentSpan * (direction === 'in' ? 0.82 : 1.2))
      const nextSpan = Math.min(Math.max(nextSpanUnclamped, minZoomSpan), chartMaxIndex)

      if (direction === 'in' && nextSpan >= currentSpan) return
      if (nextSpan >= chartMaxIndex) {
        setZoomWindow(null)
        return
      }

      let nextStart = Math.round(safeAnchorIndex - ratio * nextSpan)
      let nextEnd = nextStart + nextSpan

      if (nextStart < 0) {
        nextStart = 0
        nextEnd = nextSpan
      } else if (nextEnd > chartMaxIndex) {
        nextEnd = chartMaxIndex
        nextStart = chartMaxIndex - nextSpan
      }

      setZoomWindow({ start: nextStart, end: nextEnd })
    },
    [chartMaxIndex, chartWindow.end, chartWindow.start, minZoomSpan, pointCount],
  )

  const resetChartZoom = useCallback(() => {
    setZoomWindow(null)
  }, [])

  const onChartWheel = useCallback(
    (event: WheelEvent<SVGSVGElement>) => {
      if (pointCount < 4 || !event.deltaY) return
      event.preventDefault()

      const rect = event.currentTarget.getBoundingClientRect()
      if (!rect.width) return

      const next = indexFromClientX(event.clientX, rect)
      zoomChart(event.deltaY < 0 ? 'in' : 'out', next)
    },
    [indexFromClientX, pointCount, zoomChart],
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

    const x =
      plotFrame.x +
      ((hoverIndex - chartWindow.start) / (chartWindow.end - chartWindow.start)) * plotFrame.width

    return normalizedSeries
      .map((asset) => {
        const safeIndex = Math.min(hoverIndex, Math.max(asset.series.length - 1, 0))
        const value = asset.series[safeIndex]
        if (!Number.isFinite(value)) return null
        const y = projectValueToChartY(value, normalizedRange.min, normalizedRange.max)
        return { key: asset.symbol, color: asset.palette.stroke, x, y }
      })
      .filter((point): point is { key: string; color: string; x: number; y: number } => point !== null)
  }, [
    chartWindow.end,
    chartWindow.start,
    hoverIndex,
    normalizedRange.max,
    normalizedRange.min,
    normalizedSeries,
    plotFrame.width,
    plotFrame.x,
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

  const focusById = useCallback((id: string) => {
    if (typeof document === 'undefined') return
    document.getElementById(id)?.focus()
  }, [])

  const handleViewOptionKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
      if (viewOptions.length < 2) return

      let nextIndex: number | null = null
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        nextIndex = (index + 1) % viewOptions.length
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        nextIndex = (index - 1 + viewOptions.length) % viewOptions.length
      } else if (event.key === 'Home') {
        nextIndex = 0
      } else if (event.key === 'End') {
        nextIndex = viewOptions.length - 1
      }

      if (nextIndex === null) return
      event.preventDefault()
      const nextOption = viewOptions[nextIndex]
      setState((prev) => ({ ...prev, view: nextOption.id }))
      focusById(viewOptionId(nextOption.id))
    },
    [focusById, viewOptionId, viewOptions],
  )

  const handleSeriesOptionKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
      if (normalizedSeries.length < 2) return

      let nextIndex: number | null = null
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        nextIndex = (index + 1) % normalizedSeries.length
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        nextIndex = (index - 1 + normalizedSeries.length) % normalizedSeries.length
      } else if (event.key === 'Home') {
        nextIndex = 0
      } else if (event.key === 'End') {
        nextIndex = normalizedSeries.length - 1
      }

      if (nextIndex === null) return
      event.preventDefault()
      const nextSeries = normalizedSeries[nextIndex]
      setFocusSymbol(nextSeries.symbol)
      focusById(seriesOptionId(nextSeries.symbol))
    },
    [focusById, normalizedSeries, seriesOptionId],
  )

  return (
    <section
      data-testid="xrpl-market-panel"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      className="surface-panel panel-glow-rose relative p-7 sm:p-8"
    >
      <div className="absolute inset-x-8 top-5 ornament-line" />

      <header className="relative flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-saffron/70">{t('eyebrow')}</p>
          <h2 id={titleId} className="mt-3 font-display text-2xl font-semibold text-ivory sm:text-3xl">
            {t('title')}
          </h2>
          <p id={bodyId} className="text-sm text-ivory/70">
            {t('body')}
          </p>
        </div>
        <span
          data-testid="xrpl-market-badge"
          aria-live="polite"
          className="rounded-full bg-white/5 px-3 py-1 text-xs font-semibold tracking-wide text-ivory/70"
        >
          {state.snapshot?.source === 'fallback' ? t('badgeFallback') : t('badgeLive')}
        </span>
      </header>

      <div className="relative mt-6 space-y-5">
        <div
          id={viewFiltersId}
          data-testid="xrpl-market-filters"
          className="flex flex-wrap items-center gap-2 text-xs text-ivory/60"
          role="radiogroup"
          aria-label={t('filterGroupLabel')}
        >
          {viewOptions.map((option, index) => (
            <button
              id={viewOptionId(option.id)}
              key={option.id}
              data-testid={`xrpl-market-filter-${option.id}`}
              type="button"
              onClick={() => setState((prev) => ({ ...prev, view: option.id }))}
              onKeyDown={(event) => handleViewOptionKeyDown(event, index)}
              disabled={locked}
              role="radio"
              aria-checked={state.view === option.id}
              tabIndex={state.view === option.id ? 0 : -1}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                state.view === option.id
                  ? 'border-saffron/60 bg-saffron/10 text-saffron'
                  : 'border-white/10 bg-white/5 text-ivory/60 hover:border-white/20'
              }`}
            >
              {option.label}
            </button>
          ))}
          <span data-testid="xrpl-market-updated" className="ml-auto text-[11px] text-ivory/40">
              {state.snapshot?.updatedAt
              ? `${t('updated')} ${formatUpdatedTimeAgo(state.snapshot.updatedAt, locale, currentTimeMs)}`
              : ''}
          </span>
        </div>

        <div data-testid="xrpl-market-chart-shell" className="surface-inner p-4">
          {state.loading ? (
            <p data-testid="xrpl-market-loading" role="status" aria-live="polite" className="text-sm text-ivory/60">
              {t('loading')}
            </p>
          ) : state.error ? (
            <p data-testid="xrpl-market-error" role="alert" className="text-sm text-red-300">{state.error}</p>
          ) : (
            <div className="space-y-4">
              <div className="overflow-hidden rounded-[30px] border border-white/10 bg-[#181818] p-4 shadow-[0_10px_22px_-12px_rgba(0,0,0,0.65)]">
                <div className="flex flex-wrap items-end justify-between gap-2 pb-3">
                  <div>
                    <p id={chartLabelId} className="text-[11px] uppercase tracking-[0.12em] text-ivory/55">
                      {t('chartLabel')}
                    </p>
                    <p className="text-sm font-semibold text-ivory">
                      {displayedRange
                        ? t('chartRange', {
                            start: timelineDateFormatter.format(displayedRange.start),
                            end: timelineDateFormatter.format(displayedRange.end),
                          })
                        : '--'}
                    </p>
                  </div>
                  <div
                    id={chartControlsId}
                    data-testid="xrpl-market-chart-controls"
                    className="flex flex-wrap items-center gap-2"
                    role="group"
                    aria-label={t('chartControls')}
                  >
                    <button
                      data-testid="xrpl-market-zoom-in"
                      type="button"
                      onClick={() => zoomChart('in', hoverIndex)}
                      disabled={!canZoomIn}
                      className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-ivory/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t('zoomIn')}
                    </button>
                    <button
                      data-testid="xrpl-market-zoom-out"
                      type="button"
                      onClick={() => zoomChart('out', hoverIndex)}
                      disabled={!canZoomOut}
                      className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-ivory/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t('zoomOut')}
                    </button>
                    <button
                      data-testid="xrpl-market-reset-zoom"
                      type="button"
                      onClick={resetChartZoom}
                      disabled={!chartWindow.isZoomed}
                      className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-ivory/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t('resetZoom')}
                    </button>
                  </div>
                </div>

                <div>
                  <svg
                    ref={setChartSvgNode}
                    data-testid="xrpl-market-chart"
                    viewBox={`0 0 ${chartViewportWidth} ${CHART_HEIGHT}`}
                    className="block h-44 w-full md:h-52"
                    tabIndex={0}
                    role="group"
                    aria-roledescription="interactive chart"
                    aria-labelledby={chartLabelId}
                    aria-describedby={`${chartInstructionsId} ${chartLiveStatusId}`}
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
                        return
                      }
                      if (event.key === '+' || event.key === '=' || event.key === 'PageUp') {
                        event.preventDefault()
                        zoomChart('in', hoverIndex)
                        return
                      }
                      if (event.key === '-' || event.key === '_' || event.key === 'PageDown') {
                        event.preventDefault()
                        zoomChart('out', hoverIndex)
                        return
                      }
                      if (event.key === 'Escape') {
                        event.preventDefault()
                        if (chartWindow.isZoomed) {
                          resetChartZoom()
                          return
                        }
                        setHoverIndex(null)
                      }
                    }}
                    onWheel={onChartWheel}
                    onDoubleClick={resetChartZoom}
                  >
                    <defs>
                      <clipPath id={chartClipId}>
                        <rect
                          x={plotFrame.x}
                          y={plotFrame.y}
                          width={plotFrame.width}
                          height={plotFrame.height}
                        />
                      </clipPath>
                      {normalizedSeries.map((asset) => (
                        <linearGradient
                          key={`grad-${asset.symbol}`}
                          id={`${chartClipId}-${asset.symbol}-area`}
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop offset="0%" stopColor={asset.palette.fillStart} />
                          <stop offset="100%" stopColor={asset.palette.fillEnd} />
                        </linearGradient>
                      ))}
                    </defs>

                    <g opacity="0.45">
                      {Array.from({ length: 6 }).map((_, index) => {
                        const x = plotFrame.x + ((index + 1) / 7) * plotFrame.width
                        return (
                          <line
                            key={`grid-${index}`}
                            x1={x}
                            y1={plotFrame.y}
                            x2={x}
                            y2={plotFrame.y + plotFrame.height}
                            stroke="rgba(255,255,255,0.26)"
                            strokeWidth="0.34"
                            strokeDasharray="0.4 1.8"
                            strokeLinecap="round"
                            vectorEffect="non-scaling-stroke"
                          />
                        )
                      })}
                    </g>

                    <g clipPath={`url(#${chartClipId})`}>
                      {areaFillAsset && areaFillPath ? (
                        <path
                          key={`area-${areaFillAsset.symbol}`}
                          d={areaFillPath}
                          fill={`url(#${chartClipId}-${areaFillAsset.symbol}-area)`}
                          opacity="0.16"
                        />
                      ) : null}

                      {normalizedSeries.map((asset) => {
                        const path = buildLinePath(
                          asset.series,
                          normalizedRange.min,
                          normalizedRange.max,
                          chartWindow.start,
                          chartWindow.end,
                          chartViewportWidth,
                        )
                        if (!path) return null
                        const active = focusSymbol === null || focusSymbol === asset.symbol
                        return (
                          <path
                            key={asset.symbol}
                            d={path}
                            fill="none"
                            stroke={asset.palette.stroke}
                            strokeWidth={active ? '1.9' : '1.3'}
                            opacity={active ? '0.98' : '0.58'}
                            strokeLinecap="round"
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
                <p id={chartInstructionsId} className="sr-only">
                  {t('keyboardHint')}
                </p>
              </div>
              <p id={chartLiveStatusId} className="sr-only" aria-live="polite">
                {hoverSnapshot
                  ? `${t('pointAt')} ${pointAtDateFormatter.format(hoverSnapshot.timestamp)}`
                  : chartWindow.isZoomed
                    ? t('zoomReset')
                    : ''}
              </p>

              {timelineMarkers.length > 0 ? (
                <div data-testid="xrpl-market-timeline" className="space-y-2">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-ivory/45">{t('timelineLabel')}</p>
                  <div className="relative h-10">
                    <div className="absolute inset-x-0 top-[3px] h-px bg-white/12" />
                    {timelineMarkers.map((tick, index) => (
                      <div
                        key={`${tick.index}-${tick.timestamp}`}
                        className="absolute top-0 text-[10px] text-ivory/48"
                        style={{
                          left: `${tick.position.toFixed(3)}%`,
                          transform:
                            index === 0
                              ? 'translateX(0)'
                              : index === timelineMarkers.length - 1
                                ? 'translateX(-100%)'
                                : 'translateX(-50%)',
                        }}
                      >
                        <span className="mx-auto h-2 w-px bg-white/25" />
                        <span className="mt-1 block whitespace-nowrap rounded-full border border-white/10 bg-white/5 px-2 py-0.5">
                          {(chartWindow.isZoomed ? zoomedTimelineDateFormatter : timelineDateFormatter).format(
                            tick.timestamp,
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {chartWindow.isZoomed ? (
                <p className="text-[10px] uppercase tracking-[0.14em] text-ivory/40">
                  {t('zoomReset')}
                </p>
              ) : null}

              <div>
                <div
                  data-testid="xrpl-market-series-group"
                  className="flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  role="radiogroup"
                  aria-label={t('seriesGroupLabel')}
                >
                  {normalizedSeries.map((asset, index) => {
                    const active = focusSymbol === asset.symbol
                    const explicitName = displayNameForAsset(asset)
                    const marketLabel = asset.marketGroup === 'xrpl' ? t('table.xrpl') : t('table.reference')
                    return (
                      <button
                        id={seriesOptionId(asset.symbol)}
                        key={`chip-${asset.symbol}`}
                        data-testid={`xrpl-market-series-${asset.symbol.toLowerCase()}`}
                        type="button"
                        disabled={locked}
                        onClick={() => setFocusSymbol(asset.symbol)}
                        onKeyDown={(event) => handleSeriesOptionKeyDown(event, index)}
                        role="radio"
                        aria-checked={active}
                        tabIndex={active ? 0 : -1}
                        aria-label={`${explicitName} ${asset.symbol}, ${marketLabel}`}
                        className="inline-flex h-14 w-56 shrink-0 items-center justify-between gap-2 rounded-full border px-3 py-1.5 text-xs transition disabled:cursor-not-allowed disabled:opacity-60"
                        style={{
                          borderColor: active ? asset.palette.chipBorder : 'rgba(255,255,255,0.14)',
                          backgroundColor: active ? asset.palette.chipActiveBg : 'rgba(255,255,255,0.08)',
                          color: 'rgba(255,255,255,0.92)',
                        }}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: asset.palette.stroke }}
                          />
                          <span className="truncate">{explicitName} ({asset.symbol})</span>
                        </span>
                        <span className="shrink-0 text-[10px] text-ivory/55">{marketLabel}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {hoverSnapshot ? (
                <div
                  data-testid="xrpl-market-hover-snapshot"
                  aria-live="polite"
                  className="surface-soft rounded-2xl border border-white/10 p-3 text-[11px] text-ivory/75"
                >
                  <p className="font-semibold uppercase tracking-[0.16em] text-ivory/55">
                    {t('pointAt')} {pointAtDateFormatter.format(hoverSnapshot.timestamp)}
                  </p>
                  <div className="mt-2 space-y-1.5">
                    {hoverSnapshot.rows.map((asset) => (
                      <div
                        key={`${asset.id}-${hoverSnapshot.timestamp}`}
                        data-testid={`xrpl-market-hover-row-${asset.symbol.toLowerCase()}`}
                        className="flex items-center justify-between gap-3"
                      >
                        <span className="truncate text-ivory/65">
                          {asset.marketGroup === 'xrpl' ? t('table.xrpl') : t('table.reference')} · {asset.explicitName} ({asset.symbol})
                        </span>
                        <span className="font-semibold text-ivory">{formatUsd(asset.pointPrice, locale)}</span>
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

        <div data-testid="xrpl-market-table" className="surface-soft overflow-hidden p-4 text-sm text-ivory/70">
          <div className="space-y-2 sm:hidden">
            {visibleAssets.map((asset) => {
              const changeClass = Number.isFinite(asset.change24h)
                ? asset.change24h >= 0
                  ? 'text-emerald-200'
                  : 'text-red-300'
                : 'text-ivory/55'
              const marketLabel = asset.marketGroup === 'xrpl' ? t('table.xrpl') : t('table.reference')
              return (
                <article
                  key={`${asset.id}-card`}
                  data-testid={`xrpl-market-card-${asset.symbol.toLowerCase()}`}
                  className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold text-ivory">{asset.symbol}</p>
                    <p className="text-[10px] uppercase tracking-[0.12em] text-ivory/45">{marketLabel}</p>
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <dt className="text-ivory/45">{t('table.price')}</dt>
                    <dd className="text-right text-ivory">{formatUsd(asset.priceUsd, locale)}</dd>
                    <dt className="text-ivory/45">{t('table.change')}</dt>
                    <dd className={`text-right ${changeClass}`}>{formatPercentChange(asset.change24h, locale)}</dd>
                    <dt className="text-ivory/45">{t('table.network')}</dt>
                    <dd className="text-right text-ivory/70">{asset.network}</dd>
                  </dl>
                </article>
              )
            })}
          </div>

          <table className="hidden w-full border-collapse sm:table" aria-labelledby={tableLabelId}>
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-ivory/50">
                <th id={tableLabelId} scope="col" className="pb-3 font-medium">{t('table.asset')}</th>
                <th scope="col" className="pb-3 font-medium">{t('table.price')}</th>
                <th scope="col" className="pb-3 font-medium">{t('table.change')}</th>
                <th scope="col" className="pb-3 font-medium">{t('table.network')}</th>
              </tr>
            </thead>
            <tbody>
              {visibleAssets.map((asset) => {
                const changeClass = Number.isFinite(asset.change24h)
                  ? asset.change24h >= 0
                    ? 'text-emerald-200'
                    : 'text-red-300'
                  : 'text-ivory/55'
                return (
                  <tr key={asset.id} data-testid={`xrpl-market-row-${asset.symbol.toLowerCase()}`} className="align-top">
                    <th scope="row" className="py-2 pr-3 text-left font-medium text-ivory">{asset.symbol}</th>
                    <td className="py-2 pr-3">{formatUsd(asset.priceUsd, locale)}</td>
                    <td className={`py-2 pr-3 ${changeClass}`}>{formatPercentChange(asset.change24h, locale)}</td>
                    <td className="py-2 text-ivory/60">{asset.network}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <button
          ref={refreshButton.ref}
          data-testid="xrpl-market-refresh"
          type="button"
          onPointerEnter={refreshButton.onPointerEnter}
          onPointerLeave={refreshButton.onPointerLeave}
          onPointerDown={refreshButton.onPointerDown}
          onPointerUp={refreshButton.onPointerUp}
          onPointerCancel={refreshButton.onPointerCancel}
          onBlur={refreshButton.onBlur}
          disabled={locked}
          onClick={() => void loadSnapshot()}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#e0bf7f] via-[#cc945f] to-[#b26a49] px-5 py-3 text-base font-semibold tracking-wide text-ivory shadow-lg shadow-[#b26a49]/30 transition focus:outline-none focus:ring-2 focus:ring-saffron/40 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {t('refresh')}
        </button>

        {locked && (
          <div data-testid="xrpl-market-unlock">
            <UnlockActionsLink
              className="text-xs uppercase tracking-[0.18em] text-ivory/50"
            />
          </div>
        )}
      </div>
    </section>
  )
}
