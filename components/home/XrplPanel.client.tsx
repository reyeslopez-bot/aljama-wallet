'use client'

import { motion } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useComponentTelemetry } from '@/infra/telemetry/useComponentTelemetry'
import { useTranslations } from 'next-intl'
import { useSession } from 'next-auth/react'
import {
  DEFAULT_XRPL_NETWORK_ID,
  XRPL_NETWORKS_BY_ID,
  type XrplNetwork,
} from '@/lib/xrpl-networks'
import { useXrplNetworkStore } from '@/infra/state/xrplNetworkStore'
import UnlockActionsLink from '@/components/ui/UnlockActionsLink.client'

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

const XRPL_DEVELOPER_MODE_STORAGE_KEY = 'aljama.xrpl.developerMode'
const XRPL_ADVANCED_DEVNET_STORAGE_KEY = 'aljama.xrpl.advancedDevnet'

function toneForNetwork(network: XrplNetwork) {
  if (network.isProduction) return 'border-red-300/35 bg-red-500/15 text-red-100'
  if (network.canResetWithoutWarning) return 'border-amber-300/35 bg-amber-500/15 text-amber-100'
  return 'border-emerald-300/35 bg-emerald-500/15 text-emerald-100'
}

export function XrplPanel() {
  useComponentTelemetry('XrplPanel')
  const t = useTranslations('xrpl')
  const { status: sessionStatus } = useSession()
  const locked = sessionStatus === 'unauthenticated'
  const [copiedEndpoint, setCopiedEndpoint] = useState<'rpc' | 'wss' | 'explorer' | null>(null)
  const [debugMenuOpen, setDebugMenuOpen] = useState(false)
  const [developerModeEnabled, setDeveloperModeEnabled] = useState(false)
  const [advancedDevnetEnabled, setAdvancedDevnetEnabled] = useState(false)

  const selectedNetworkId = useXrplNetworkStore((s) => s.selectedNetworkId)
  const setSelectedNetworkId = useXrplNetworkStore((s) => s.setSelectedNetworkId)
  const [state, setState] = useState<XrplState>(initialState)
  const requestIdRef = useRef(0)

  const devnetFlagEnabled = process.env.NEXT_PUBLIC_XRPL_DEVNET_ENABLED === 'true'
  const showDevnet = devnetFlagEnabled && developerModeEnabled && advancedDevnetEnabled
  const selectableNetworks = useMemo(() => {
    const baseNetworks = [XRPL_NETWORKS_BY_ID.mainnet, XRPL_NETWORKS_BY_ID.testnet]
    return showDevnet ? [...baseNetworks, XRPL_NETWORKS_BY_ID.devnet] : baseNetworks
  }, [showDevnet])

  const selectedNetwork = useMemo(
    () =>
      selectableNetworks.find((network) => network.id === selectedNetworkId) ??
      XRPL_NETWORKS_BY_ID[DEFAULT_XRPL_NETWORK_ID],
    [selectableNetworks, selectedNetworkId],
  )
  const hasDedicatedExplorer = selectedNetwork.explorerUrl !== selectedNetwork.rpcUrl
  const titleId = 'xrpl-panel-title'
  const bodyId = 'xrpl-panel-body'
  const selectorLabelId = 'xrpl-network-selector-label'
  const selectorHintId = 'xrpl-network-selector-hint'
  const debugMenuId = 'xrpl-debug-menu'
  const copyStatusId = 'xrpl-copy-status'
  const accountStatusId = 'xrpl-account-status'
  const networkOptionId = useCallback((networkId: string) => `xrpl-network-option-${networkId}`, [])

  useEffect(() => {
    if (!devnetFlagEnabled || typeof window === 'undefined') return
    const storage = window.localStorage
    if (!storage || typeof storage.getItem !== 'function') return
    setDeveloperModeEnabled(storage.getItem(XRPL_DEVELOPER_MODE_STORAGE_KEY) === 'true')
    setAdvancedDevnetEnabled(storage.getItem(XRPL_ADVANCED_DEVNET_STORAGE_KEY) === 'true')
  }, [devnetFlagEnabled])

  useEffect(() => {
    if (!devnetFlagEnabled || typeof window === 'undefined') return
    const storage = window.localStorage
    if (!storage || typeof storage.setItem !== 'function') return
    storage.setItem(XRPL_DEVELOPER_MODE_STORAGE_KEY, developerModeEnabled ? 'true' : 'false')
    storage.setItem(XRPL_ADVANCED_DEVNET_STORAGE_KEY, advancedDevnetEnabled ? 'true' : 'false')
  }, [advancedDevnetEnabled, developerModeEnabled, devnetFlagEnabled])

  useEffect(() => {
    if (developerModeEnabled || !advancedDevnetEnabled) return
    setAdvancedDevnetEnabled(false)
  }, [advancedDevnetEnabled, developerModeEnabled])

  useEffect(() => {
    if (selectableNetworks.some((network) => network.id === selectedNetworkId)) return
    setSelectedNetworkId(DEFAULT_XRPL_NETWORK_ID)
  }, [selectableNetworks, selectedNetworkId, setSelectedNetworkId])

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

  const focusNetworkOption = useCallback(
    (index: number) => {
      const network = selectableNetworks[index]
      if (!network || typeof document === 'undefined') return
      document.getElementById(networkOptionId(network.id))?.focus()
    },
    [networkOptionId, selectableNetworks],
  )

  const handleNetworkOptionKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
      if (selectableNetworks.length < 2) return

      let nextIndex: number | null = null
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        nextIndex = (index + 1) % selectableNetworks.length
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        nextIndex = (index - 1 + selectableNetworks.length) % selectableNetworks.length
      } else if (event.key === 'Home') {
        nextIndex = 0
      } else if (event.key === 'End') {
        nextIndex = selectableNetworks.length - 1
      }

      if (nextIndex === null) return
      event.preventDefault()
      const nextNetwork = selectableNetworks[nextIndex]
      setSelectedNetworkId(nextNetwork.id)
      focusNetworkOption(nextIndex)
    },
    [focusNetworkOption, selectableNetworks, setSelectedNetworkId],
  )

  return (
    <section
      aria-labelledby={titleId}
      aria-describedby={`${bodyId} ${selectorHintId}`}
      className="surface-panel panel-glow-lapis relative p-7 sm:p-8"
    >
      <div className="absolute inset-x-8 top-5 ornament-line" />

      <header className="relative space-y-3">
        <p className="text-xs uppercase tracking-[0.2em] text-saffron/70">{t('eyebrow')}</p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id={titleId} className="font-display text-2xl font-semibold text-ivory sm:text-3xl">
            {t('title')}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <span
              aria-live="polite"
              className="rounded-full bg-white/5 px-3 py-1 text-xs font-semibold tracking-wide text-ivory/70"
            >
              {state.loading ? t('statusSyncing') : t('statusOnline')}
            </span>
            <span
              aria-live="polite"
              className={`rounded-full border px-3 py-1 text-[11px] font-semibold tracking-wide ${toneForNetwork(selectedNetwork)}`}
            >
              {selectedNetwork.name}
            </span>
          </div>
        </div>
        <p id={bodyId} className="text-sm text-ivory/70">
          {t('body')}
        </p>
      </header>

      <div className="relative mt-6 space-y-4">
        <div id="xrpl-network" className="surface-inner p-4">
          <div className="space-y-2">
            <p id={selectorLabelId} className="text-xs uppercase tracking-[0.16em] text-ivory/60">
              {t('networkSelectorLabel')}
            </p>
            <p id={selectorHintId} className="text-xs text-ivory/60">
              {t('networkSelectorHint')}
            </p>
          </div>

          {devnetFlagEnabled ? (
            <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
              <button
                type="button"
                onClick={() => setDebugMenuOpen((prev) => !prev)}
                aria-expanded={debugMenuOpen}
                aria-controls={debugMenuId}
                className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ivory/80 transition hover:bg-white/10"
              >
                {t('debugMenuButton')}
              </button>

              {debugMenuOpen ? (
                <div id={debugMenuId} className="mt-3 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p id="xrpl-developer-mode-label" className="text-xs font-semibold text-ivory/90">
                        {t('developerModeLabel')}
                      </p>
                      <p id="xrpl-developer-mode-hint" className="text-[11px] text-ivory/55">
                        {t('developerModeHint')}
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={developerModeEnabled}
                      aria-labelledby="xrpl-developer-mode-label"
                      aria-describedby="xrpl-developer-mode-hint"
                      onClick={() => setDeveloperModeEnabled((prev) => !prev)}
                      className="relative h-7 w-12 rounded-full border border-white/20 bg-white/10 transition"
                    >
                      <span
                        aria-hidden="true"
                        className={`absolute top-0.5 h-[22px] w-[22px] rounded-full bg-white transition ${
                          developerModeEnabled ? 'left-6 bg-white shadow-[0_0_12px_rgba(240,215,160,0.35)]' : 'left-0.5 bg-white/95'
                        }`}
                      />
                    </button>
                  </div>

                  <div className={`flex items-center justify-between gap-3 ${!developerModeEnabled ? 'opacity-60' : ''}`}>
                    <div>
                      <p id="xrpl-advanced-devnet-label" className="text-xs font-semibold text-ivory/90">
                        {t('advancedDevnetLabel')}
                      </p>
                      <p id="xrpl-advanced-devnet-hint" className="text-[11px] text-ivory/55">
                        {t('advancedDevnetHint')}
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={advancedDevnetEnabled}
                      aria-labelledby="xrpl-advanced-devnet-label"
                      aria-describedby="xrpl-advanced-devnet-hint"
                      onClick={() => {
                        if (!developerModeEnabled) return
                        setAdvancedDevnetEnabled((prev) => !prev)
                      }}
                      disabled={!developerModeEnabled}
                      className="relative h-7 w-12 rounded-full border border-white/20 bg-white/10 transition disabled:cursor-not-allowed"
                    >
                      <span
                        aria-hidden="true"
                        className={`absolute top-0.5 h-[22px] w-[22px] rounded-full bg-white transition ${
                          advancedDevnetEnabled ? 'left-6 bg-white shadow-[0_0_12px_rgba(127,163,193,0.35)]' : 'left-0.5 bg-white/95'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <div
            className="mt-3 grid gap-2 sm:grid-cols-2"
            role="radiogroup"
            aria-labelledby={selectorLabelId}
            aria-describedby={selectorHintId}
          >
            {selectableNetworks.map((network, index) => {
              const active = network.id === selectedNetwork.id
              return (
                <button
                  key={network.id}
                  id={networkOptionId(network.id)}
                  type="button"
                  onClick={() => setSelectedNetworkId(network.id)}
                  onKeyDown={(event) => handleNetworkOptionKeyDown(event, index)}
                  role="radio"
                  aria-checked={active}
                  tabIndex={active ? 0 : -1}
                  aria-label={`${network.name}. ${
                    network.isProduction ? t('networkTypeMainnet') : t('networkTypeNonProduction')
                  }`}
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
                    aria-label={`Copy RPC endpoint`}
                    aria-describedby={copyStatusId}
                    className="rounded-full border border-white/15 bg-black/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ivory/75 transition hover:bg-white/10"
                  >
                    {copiedEndpoint === 'rpc' ? t('copied') : t('copy')}
                  </button>
                </div>
                <p data-copyable="true" className="mt-1 break-all select-all font-mono text-[11px] text-ivory/85">
                  {selectedNetwork.rpcUrl}
                </p>
              </div>

              <div className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10px] uppercase tracking-[0.14em] text-ivory/55">WSS</span>
                  <button
                    type="button"
                    onClick={() => void copyEndpoint('wss', selectedNetwork.wsUrl)}
                    aria-label={`Copy WSS endpoint`}
                    aria-describedby={copyStatusId}
                    className="rounded-full border border-white/15 bg-black/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ivory/75 transition hover:bg-white/10"
                  >
                    {copiedEndpoint === 'wss' ? t('copied') : t('copy')}
                  </button>
                </div>
                <p data-copyable="true" className="mt-1 break-all select-all font-mono text-[11px] text-ivory/85">
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
                        aria-label={t('openExplorer')}
                        className="rounded-full border border-white/15 bg-black/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ivory/75 transition hover:bg-white/10"
                      >
                        {t('openExplorer')}
                      </a>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void copyEndpoint('explorer', selectedNetwork.explorerUrl)}
                      aria-label={`Copy explorer endpoint`}
                      aria-describedby={copyStatusId}
                      className="rounded-full border border-white/15 bg-black/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ivory/75 transition hover:bg-white/10"
                    >
                      {copiedEndpoint === 'explorer' ? t('copied') : t('copy')}
                    </button>
                  </div>
                </div>
                <p data-copyable="true" className="mt-1 break-all select-all font-mono text-[11px] text-ivory/85">
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

            <p id={copyStatusId} className="sr-only" aria-live="polite">
              {copiedEndpoint ? `${copiedEndpoint.toUpperCase()} ${t('copied')}` : ''}
            </p>
          </div>
        </div>

        <div id={accountStatusId} className="surface-inner p-4" aria-live="polite">
          {state.loading ? (
            <p className="text-sm text-ivory/60">{t('loading')}</p>
          ) : state.error ? (
            <p role="alert" className="text-sm text-red-300">{state.error}</p>
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
          aria-describedby={accountStatusId}
          onClick={() => void loadAccount()}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#6f96c9] via-[#5b86a8] to-[#4b9577] px-5 py-3 text-base font-semibold tracking-wide text-ivory shadow-lg shadow-[#4b9577]/30 transition focus:outline-none focus:ring-2 focus:ring-lapis/40 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {t('refresh')}
        </motion.button>

        {locked && (
          <UnlockActionsLink
            className="text-xs uppercase tracking-[0.18em] text-ivory/50"
          />
        )}
      </div>
    </section>
  )
}
