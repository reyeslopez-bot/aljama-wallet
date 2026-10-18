export type MarketAsset = {
  id: string
  symbol: string
  name: string
  marketGroup: 'xrpl' | 'reference'
  network: string
  priceUsd: number
  change24h: number
  series: number[]
}

export type MarketSnapshot = {
  ok: true
  source: 'coingecko' | 'fallback'
  updatedAt: string
  assets: MarketAsset[]
}

export type TimelineTick = { index: number; timestamp: number }
export type TimelineMarker = TimelineTick & { position: number }
export type ZoomWindow = { start: number; end: number }

type AssetPalette = {
  stroke: string
  fillStart: string
  fillEnd: string
  chipActiveBg: string
  chipBorder: string
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

export const CHART_WIDTH = 100
export const CHART_HEIGHT = 48
const PLOT_INSET_X = 3
const PLOT_INSET_Y = 4
const PLOT_RANGE_PADDING_RATIO = 0.08
const MIN_PLOT_RANGE_PADDING = 0.015
export const XRPL_MARKET_PANEL_ID_PREFIX = 'xrpl-market-panel'

export function paletteForSymbol(symbol: string): AssetPalette {
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

export function normalizeSeries(series: number[]): number[] {
  if (series.length === 0) return []
  const first = series[0] ?? 1
  const safeFirst = first === 0 ? 1 : first
  return series.map((value) => value / safeFirst)
}

export function displayNameForAsset(asset: Pick<MarketAsset, 'symbol' | 'name'>) {
  return asset.symbol === 'XRP' ? 'Ripple' : asset.name
}

export function getPlotFrame(chartWidth: number): PlotFrame {
  return {
    x: PLOT_INSET_X,
    y: PLOT_INSET_Y,
    width: Math.max(chartWidth - PLOT_INSET_X * 2, 1),
    height: Math.max(CHART_HEIGHT - PLOT_INSET_Y * 2, 1),
  }
}

export function buildPaddedRange(values: number[]) {
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

export function projectValueToChartY(value: number, min: number, max: number) {
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

export function buildLinePath(
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

export function buildAreaPath(
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

export function formatUsd(value: number, locale: string) {
  if (!Number.isFinite(value)) return '--'
  return value.toLocaleString(locale, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value < 1 ? 4 : 2,
  })
}

export function formatPercentChange(value: number, locale: string) {
  if (!Number.isFinite(value)) return '--'
  const formatted = Math.abs(value).toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  if (value > 0) return `+${formatted}%`
  if (value < 0) return `-${formatted}%`
  return `${formatted}%`
}

export function formatUpdatedTimeAgo(updatedAt: string, locale: string, nowMs: number): string {
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

export function seriesIndexToTimestamp(
  updatedAt: string | null | undefined,
  index: number,
  pointCount: number,
): number | null {
  if (!updatedAt || pointCount < 2) return null
  const end = new Date(updatedAt).getTime()
  if (!Number.isFinite(end)) return null
  const start = end - 30 * 24 * 60 * 60 * 1_000
  const ratio = Math.min(Math.max(index / (pointCount - 1), 0), 1)
  return Math.round(start + ratio * (end - start))
}

export function buildTimelineTicks(
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
