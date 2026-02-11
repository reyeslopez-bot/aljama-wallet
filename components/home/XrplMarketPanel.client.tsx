// components/home/XrplMarketPanel.client.tsx
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useComponentTelemetry } from '@/infra/telemetry/useComponentTelemetry'

type MarketAsset = {
  id: string
  symbol: string
  name: string
  network: 'xrpl' | 'reference'
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

const viewOptions = [
  { id: 'all', label: 'All' },
  { id: 'xrpl', label: 'XRPL' },
  { id: 'reference', label: 'Reference' },
] as const

type ViewOption = (typeof viewOptions)[number]['id']

function normalizeSeries(series: number[]): number[] {
  if (series.length === 0) return []
  const first = series[0] ?? 1
  const safeFirst = first === 0 ? 1 : first
  return series.map((value) => value / safeFirst)
}

function buildPath(series: number[], min: number, max: number) {
  if (series.length < 2) return ''
  const width = 100
  const height = 48
  const padding = 4
  const span = max - min || 1
  return series
    .map((value, index) => {
      const x = (index / (series.length - 1)) * width
      const y =
        height -
        padding -
        ((value - min) / span) * (height - padding * 2)
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
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

export default function XrplMarketPanel() {
  useComponentTelemetry('XrplMarketPanel')
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
    return state.snapshot.assets.filter((asset) => asset.network === state.view)
  }, [state.snapshot, state.view])

  const normalized = useMemo(() => {
    const normalizedSeries = visibleAssets.map((asset) => ({
      symbol: asset.symbol,
      color: COLORS[asset.symbol] ?? '#ffffff',
      series: normalizeSeries(asset.series),
    }))
    const values = normalizedSeries.flatMap((asset) => asset.series)
    const min = values.length ? Math.min(...values) : 0.9
    const max = values.length ? Math.max(...values) : 1.1
    return { normalizedSeries, min, max }
  }, [visibleAssets])

  return (
    <section className="surface-panel panel-glow-rose relative p-7 sm:p-8">
      <div className="absolute inset-x-8 top-5 ornament-line" />

      <header className="relative flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-saffron/70">
            Market Snapshot
          </p>
          <h2 className="mt-3 font-display text-2xl font-semibold text-ivory sm:text-3xl">
            XRPL vs. majors
          </h2>
          <p className="text-sm text-ivory/70">
            Normalized 24h index. Reference prices are cross-chain and may not be issued on XRPL.
          </p>
        </div>
        <span className="rounded-full bg-white/5 px-3 py-1 text-xs font-semibold tracking-wide text-ivory/70">
          {state.snapshot?.source === 'fallback' ? 'Fallback data' : 'Live'}
        </span>
      </header>

      <div className="relative mt-6 space-y-5">
        <div className="flex flex-wrap items-center gap-2 text-xs text-ivory/60">
          {viewOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setState((prev) => ({ ...prev, view: option.id }))}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
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
              ? `Updated ${new Date(state.snapshot.updatedAt).toLocaleTimeString()}`
              : ''}
          </span>
        </div>

        <div className="surface-inner p-4">
          {state.loading ? (
            <p className="text-sm text-ivory/60">Loading market data…</p>
          ) : state.error ? (
            <p className="text-sm text-red-300">{state.error}</p>
          ) : (
            <div className="space-y-4">
              <svg viewBox="0 0 100 48" className="h-32 w-full">
                <defs>
                  <linearGradient id="marketGlow" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#6fa0d9" stopOpacity="0.35" />
                    <stop offset="50%" stopColor="#e0bf7f" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#4b9577" stopOpacity="0.35" />
                  </linearGradient>
                </defs>
                <rect x="0" y="0" width="100" height="48" fill="url(#marketGlow)" opacity="0.08" />
                {normalized.normalizedSeries.map((asset) => {
                  const path = buildPath(asset.series, normalized.min, normalized.max)
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
              </svg>

              <div className="flex flex-wrap items-center gap-3 text-xs text-ivory/60">
                {visibleAssets.map((asset) => (
                  <span key={asset.id} className="inline-flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: COLORS[asset.symbol] ?? '#ffffff' }}
                    />
                    {asset.symbol}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="surface-soft p-4 text-sm text-ivory/70">
          <div className="grid grid-cols-4 gap-3 text-xs uppercase tracking-wide text-ivory/50">
            <span>Asset</span>
            <span>Price</span>
            <span>24h</span>
            <span>Network</span>
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
                  {asset.network === 'xrpl' ? 'XRPL' : 'Reference'}
                </span>
              </div>
            ))}
          </div>
        </div>

        <motion.button
          type="button"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => void loadSnapshot()}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#e0bf7f] via-[#cc945f] to-[#b26a49] px-5 py-3 text-base font-semibold tracking-wide text-[#1c120a] shadow-lg shadow-[#b26a49]/30 transition focus:outline-none focus:ring-2 focus:ring-saffron/40"
        >
          Refresh market snapshot
        </motion.button>
      </div>
    </section>
  )
}
