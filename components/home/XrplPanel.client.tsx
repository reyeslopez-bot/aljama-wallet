'use client'

import { motion } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useComponentTelemetry } from '@/infra/telemetry/useComponentTelemetry'
import { useTranslations } from 'next-intl'
import { useSession } from 'next-auth/react'
import {
  XRPL_NETWORKS,
  XRPL_NETWORKS_BY_ID,
  type XrplNetwork,
} from '@/lib/xrpl-networks'
import { useXrplNetworkStore } from '@/infra/state/xrplNetworkStore'

type XrplAccount = {
  address: string
  xrpBalance: string
}

type XrplState = {
  loading: boolean
  error: string | null
  account: XrplAccount | null
}

const initialState: XrplState = {
  loading: true,
  error: null,
  account: null,
}

function toneForNetwork(network: XrplNetwork) {
  if (network.isProduction) return 'border-red-300/35 bg-red-500/15 text-red-100'
  if (network.canResetWithoutWarning) return 'border-amber-300/35 bg-amber-500/15 text-amber-100'
  return 'border-emerald-300/35 bg-emerald-500/15 text-emerald-100'
}

export function XrplPanel() {
  useComponentTelemetry('XrplPanel')
  const t = useTranslations('xrpl')
  const tAuth = useTranslations('auth')
  const { status: sessionStatus } = useSession()
  const locked = sessionStatus === 'unauthenticated'
  const [copiedEndpoint, setCopiedEndpoint] = useState<'rpc' | 'wss' | 'explorer' | null>(null)

  const selectedNetworkId = useXrplNetworkStore((s) => s.selectedNetworkId)
  const setSelectedNetworkId = useXrplNetworkStore((s) => s.setSelectedNetworkId)
  const [state, setState] = useState<XrplState>(initialState)
  const requestIdRef = useRef(0)

  const selectedNetwork = useMemo(
    () => XRPL_NETWORKS_BY_ID[selectedNetworkId],
    [selectedNetworkId],
  )
  const hasDedicatedExplorer = selectedNetwork.explorerUrl !== selectedNetwork.rpcUrl

  const loadAccount = useCallback(async () => {
    const requestId = ++requestIdRef.current
    setState((prev) => ({ ...prev, loading: true, error: null }))

    try {
      const res = await fetch(`/api/xrpl/dev-account?network=${selectedNetwork.id}`)
      const body = (await res.json()) as
        | { ok: true; account: XrplAccount; network: string }
        | { ok: false; error: string }

      if (!res.ok || !body.ok) {
        throw new Error('XRPL account not available for the selected network')
      }

      if (requestId !== requestIdRef.current) return
      setState({ loading: false, error: null, account: body.account })
    } catch (error) {
      if (requestId !== requestIdRef.current) return
      setState({
        loading: false,
        error: error instanceof Error ? error.message : 'XRPL error',
        account: null,
      })
    }
  }, [selectedNetwork.id])

  useEffect(() => {
    void loadAccount()
  }, [loadAccount])

  useEffect(() => {
    if (!copiedEndpoint) return
    const timeout = window.setTimeout(() => setCopiedEndpoint(null), 1400)
    return () => window.clearTimeout(timeout)
  }, [copiedEndpoint])

  const copyEndpoint = useCallback(async (kind: 'rpc' | 'wss' | 'explorer', value: string) => {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return

    try {
      await navigator.clipboard.writeText(value)
      setCopiedEndpoint(kind)
    } catch {
      // ignore clipboard failures
    }
  }, [])

  return (
    <section className="surface-panel panel-glow-lapis relative p-7 sm:p-8">
      <div className="absolute inset-x-8 top-5 ornament-line" />

      <header className="relative flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-saffron/70">{t('eyebrow')}</p>
          <h2 className="mt-3 font-display text-2xl font-semibold text-ivory sm:text-3xl">
            {t('title')}
          </h2>
          <p className="text-sm text-ivory/70">{t('body')}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className="rounded-full bg-white/5 px-3 py-1 text-xs font-semibold tracking-wide text-ivory/70">
            {state.loading ? t('statusSyncing') : t('statusOnline')}
          </span>
          <span
            className={`rounded-full border px-3 py-1 text-[11px] font-semibold tracking-wide ${toneForNetwork(selectedNetwork)}`}
          >
            {selectedNetwork.name}
          </span>
        </div>
      </header>

      <div className="relative mt-6 space-y-4">
        <div id="xrpl-network" className="surface-inner p-4">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.16em] text-ivory/60">
              {t('networkSelectorLabel')}
            </p>
            <p className="text-xs text-ivory/60">{t('networkSelectorHint')}</p>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {XRPL_NETWORKS.map((network) => {
              const active = network.id === selectedNetwork.id
              return (
                <button
                  key={network.id}
                  type="button"
                  onClick={() => setSelectedNetworkId(network.id)}
                  className={`flex min-h-[84px] flex-col items-center justify-center rounded-xl border px-3 py-2 text-center transition ${
                    active
                      ? 'border-saffron/45 bg-saffron/20 text-ivory'
                      : 'border-white/10 bg-black/30 text-ivory/75 hover:bg-white/10'
                  }`}
                >
                  <p className="text-sm font-semibold leading-tight">{network.name}</p>
                  <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-ivory/60">
                    {network.isProduction
                      ? t('networkTypeMainnet')
                      : t('networkTypeNonProduction')}
                  </p>
                </button>
              )
            })}
          </div>

          <div className="surface-soft mt-3 space-y-3 p-4 text-xs text-ivory/75">
            <div className="flex items-center justify-between gap-3">
              <span className="text-ivory/55">{t('selectedNetwork')}</span>
              <span className="font-semibold text-ivory">{selectedNetwork.name}</span>
            </div>

            <div className="grid gap-2">
              <div className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10px] uppercase tracking-[0.14em] text-ivory/55">RPC</span>
                  <button
                    type="button"
                    onClick={() => void copyEndpoint('rpc', selectedNetwork.rpcUrl)}
                    className="rounded-full border border-white/15 bg-black/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ivory/75 transition hover:bg-white/10"
                  >
                    {copiedEndpoint === 'rpc' ? t('copied') : t('copy')}
                  </button>
                </div>
                <p className="mt-1 break-all select-all font-mono text-[11px] text-ivory/85">
                  {selectedNetwork.rpcUrl}
                </p>
              </div>

              <div className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10px] uppercase tracking-[0.14em] text-ivory/55">WSS</span>
                  <button
                    type="button"
                    onClick={() => void copyEndpoint('wss', selectedNetwork.wsUrl)}
                    className="rounded-full border border-white/15 bg-black/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ivory/75 transition hover:bg-white/10"
                  >
                    {copiedEndpoint === 'wss' ? t('copied') : t('copy')}
                  </button>
                </div>
                <p className="mt-1 break-all select-all font-mono text-[11px] text-ivory/85">
                  {selectedNetwork.wsUrl}
                </p>
              </div>

              <div className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10px] uppercase tracking-[0.14em] text-ivory/55">Explorer</span>
                  <div className="flex items-center gap-1.5">
                    {hasDedicatedExplorer ? (
                      <a
                        href={selectedNetwork.explorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-full border border-white/15 bg-black/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ivory/75 transition hover:bg-white/10"
                      >
                        {t('openExplorer')}
                      </a>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void copyEndpoint('explorer', selectedNetwork.explorerUrl)}
                      className="rounded-full border border-white/15 bg-black/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ivory/75 transition hover:bg-white/10"
                    >
                      {copiedEndpoint === 'explorer' ? t('copied') : t('copy')}
                    </button>
                  </div>
                </div>
                <p className="mt-1 break-all select-all font-mono text-[11px] text-ivory/85">
                  {selectedNetwork.explorerUrl}
                </p>
              </div>
            </div>

            <p className="text-[11px] text-ivory/55">
              {t('endpointHint')}
            </p>
            {!hasDedicatedExplorer ? (
              <p className="text-[11px] text-ivory/50">
                {t('explorerUnavailable')}
              </p>
            ) : null}

            {selectedNetwork.isProduction ? (
              <p className="rounded-lg border border-red-300/40 bg-red-500/15 px-3 py-2 text-red-100">
                {t('mainnetWarning')}
              </p>
            ) : null}

            {!selectedNetwork.isProduction && selectedNetwork.canResetWithoutWarning ? (
              <p className="rounded-lg border border-amber-300/40 bg-amber-500/15 px-3 py-2 text-amber-100">
                {t('resetWarning')}
              </p>
            ) : null}

            {!selectedNetwork.isProduction && selectedNetwork.faucetUrl ? (
              <a
                href={selectedNetwork.faucetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-[#6f96c9] via-[#5b86a8] to-[#4b9577] px-4 py-2 text-xs font-semibold tracking-wide text-ivory shadow-lg shadow-[#4b9577]/30 transition hover:brightness-105"
              >
                {t('openFaucet')}
              </a>
            ) : null}
          </div>
        </div>

        <div className="surface-inner p-4">
          {state.loading ? (
            <p className="text-sm text-ivory/60">{t('loading')}</p>
          ) : state.error ? (
            <p className="text-sm text-red-300">{state.error}</p>
          ) : state.account ? (
            <div className="space-y-3">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-jade/80">{t('accountTitle')}</p>
                <p className="mt-1 break-all font-mono text-sm text-jade">{state.account.address}</p>
              </div>
              <div className="surface-soft px-4 py-3">
                <p className="text-xs uppercase tracking-[0.14em] text-ivory/60">{t('balanceLabel')}</p>
                <p className="mt-1 text-lg font-semibold text-ivory">{state.account.xrpBalance} XRP</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-ivory/60">{t('empty')}</p>
          )}
        </div>

        <motion.button
          type="button"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          disabled={locked}
          onClick={() => void loadAccount()}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#6f96c9] via-[#5b86a8] to-[#4b9577] px-5 py-3 text-base font-semibold tracking-wide text-ivory shadow-lg shadow-[#4b9577]/30 transition focus:outline-none focus:ring-2 focus:ring-lapis/40 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {t('refresh')}
        </motion.button>

        {locked && (
          <p className="text-xs uppercase tracking-[0.18em] text-ivory/50">{tAuth('unlockActions')}</p>
        )}
      </div>
    </section>
  )
}
