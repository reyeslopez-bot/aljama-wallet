'use client'

import { AnimatePresence, motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useDynamicInfoStore } from '@/hooks/useDynamicInfoStore'
import { useTranslations } from 'next-intl'
import { useXrplNetworkStore } from '@/infra/state/xrplNetworkStore'
import { XRPL_NETWORKS_BY_ID } from '@/lib/xrpl-networks'
import { formatTime24 } from '@/lib/time-format'

function formatShortAddress(address: string) {
  const trimmed = address.trim()
  if (trimmed.length <= 12) return trimmed
  return `${trimmed.slice(0, 6)}…${trimmed.slice(-4)}`
}

function StatusDot({ tone }: { tone: 'ok' | 'warn' | 'bad' | 'idle' }) {
  const cls =
    tone === 'ok'
      ? 'bg-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.35)]'
      : tone === 'warn'
        ? 'bg-saffron shadow-[0_0_20px_rgba(210,167,98,0.3)]'
        : tone === 'bad'
          ? 'bg-red-400 shadow-[0_0_20px_rgba(248,113,113,0.25)]'
          : 'bg-white/25'

  return <span className={`h-2 w-2 rounded-full ${cls}`} />
}

function IconButton(props: {
  label: string
  onClick?: () => void
  href?: string
  isLight?: boolean
  children: ReactNode
}) {
  const className = props.isLight
    ? 'inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#7fa3c1]/45 bg-white/70 text-[#35506c] transition hover:bg-white hover:text-[#1d2f45] focus:outline-none focus:ring-2 focus:ring-[#5c8db4]/35'
    : 'inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-ivory/70 transition hover:bg-white/10 hover:text-ivory focus:outline-none focus:ring-2 focus:ring-saffron/30'

  if (props.href) {
    return (
      <a
        className={className}
        href={props.href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={props.label}
        title={props.label}
      >
        {props.children}
      </a>
    )
  }

  return (
    <button
      type="button"
      className={className}
      onClick={props.onClick}
      aria-label={props.label}
      title={props.label}
    >
      {props.children}
    </button>
  )
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        fill="currentColor"
        d="M18.9 2H22l-6.8 7.8L23.2 22H16.7l-5.1-6.5L5.8 22H2.7l7.3-8.3L1 2h6.7l4.6 6 6.6-6Zm-1.1 18h1.7L7.9 3.9H6.1L17.8 20Z"
      />
    </svg>
  )
}

function LinkedinIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        fill="currentColor"
        d="M20.4 20.4h-3.6v-5.7c0-1.4 0-3.2-2-3.2s-2.3 1.5-2.3 3.1v5.8H9V9h3.4v1.6h.1c.5-.9 1.7-1.9 3.5-1.9 3.7 0 4.4 2.4 4.4 5.6v6.1ZM4.9 7.4c-1.2 0-2.2-1-2.2-2.2S3.7 3 4.9 3s2.2 1 2.2 2.2-1 2.2-2.2 2.2ZM6.7 20.4H3.1V9h3.6v11.4Z"
      />
    </svg>
  )
}

function GithubIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2C6.5 2 2 6.6 2 12.2c0 4.5 2.9 8.3 6.9 9.6.5.1.7-.2.7-.5v-1.9c-2.8.6-3.4-1.4-3.4-1.4-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.6 1.1 1.6 1.1.9 1.6 2.4 1.1 3 .8.1-.7.4-1.1.7-1.3-2.2-.3-4.5-1.1-4.5-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.6 0 0 .8-.3 2.7 1 .8-.2 1.6-.3 2.4-.3s1.7.1 2.4.3c1.9-1.3 2.7-1 2.7-1 .5 1.3.2 2.3.1 2.6.6.7 1 1.6 1 2.7 0 3.9-2.3 4.7-4.5 5 .4.4.8 1.1.8 2.2v3.2c0 .3.2.6.7.5 4-1.3 6.9-5.1 6.9-9.6C22 6.6 17.5 2 12 2Z"
      />
    </svg>
  )
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 7a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2V7Zm2 0v11h9V7h-9ZM3 6a2 2 0 0 1 2-2h1v2H5v11h9v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z"
      />
    </svg>
  )
}

export default function DynamicInfoCard() {
  const t = useTranslations('infoCard')
  const [hovered, setHovered] = useState(false)
  const [now, setNow] = useState<Date | null>(null)
  const [isLightTheme, setIsLightTheme] = useState(false)

  const user = useDynamicInfoStore((s) => s.user)
  const wallet = useDynamicInfoStore((s) => s.wallet)
  const createStatus = useDynamicInfoStore((s) => s.createWalletStatus)
  const connectStatus = useDynamicInfoStore((s) => s.connectWalletStatus)
  const trackingStatus = useDynamicInfoStore((s) => s.trackingStatus)
  const lastEvent = useDynamicInfoStore((s) => s.lastEvent)
  const pushEvent = useDynamicInfoStore((s) => s.pushEvent)
  const selectedXrplNetworkId = useXrplNetworkStore((s) => s.selectedNetworkId)

  useEffect(() => {
    setNow(new Date())
    const t = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined') return
    const syncTheme = () => setIsLightTheme(document.body.classList.contains('light'))
    syncTheme()
    const observer = new MutationObserver(syncTheme)
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  const timeLabel = useMemo(
    () => {
      if (!now) return '--:--'
      return formatTime24(now)
    },
    [now],
  )

  const statusTone: 'ok' | 'warn' | 'bad' | 'idle' = useMemo(() => {
    if (createStatus === 'error' || connectStatus === 'error') return 'bad'
    if (createStatus === 'pending' || connectStatus === 'pending' || trackingStatus === 'pending') return 'warn'
    if (wallet.connectedAddress) return 'ok'
    return 'idle'
  }, [connectStatus, createStatus, trackingStatus, wallet.connectedAddress])

  const statusLabel = useMemo(() => {
    if (createStatus === 'pending') return t('status.creating')
    if (connectStatus === 'pending') return t('status.syncing')
    if (createStatus === 'error' || connectStatus === 'error') return t('status.action')
    if (wallet.connectedAddress) return t('status.available')
    if (wallet.createdAddress) return t('status.vault')
    return t('status.idle')
  }, [connectStatus, createStatus, wallet.connectedAddress, wallet.createdAddress])

  const primaryLine = useMemo(() => {
    if (wallet.connectedAddress) return formatShortAddress(wallet.connectedAddress)
    if (wallet.createdAddress) return formatShortAddress(wallet.createdAddress)
    return user?.name ?? 'Guest'
  }, [user?.name, wallet.connectedAddress, wallet.createdAddress])

  const secondaryLine = useMemo(() => {
    if (wallet.connectedAddress) {
      const parts = [wallet.chainName, wallet.connectorName].filter(Boolean)
      return parts.length ? parts.join(' · ') : 'Connected'
    }
    if (wallet.createdAddress) return 'Custody ready'
    return user?.role ?? 'New arrival'
  }, [user?.role, wallet.chainName, wallet.connectorName, wallet.connectedAddress, wallet.createdAddress])

  const copyText = wallet.connectedAddress ?? wallet.createdAddress
  const vaultSessionLabel = useMemo(() => {
    if (wallet.connectedAddress) return t('status.available')
    if (connectStatus === 'pending') return t('status.syncing')
    if (connectStatus === 'error') return t('status.action')
    if (wallet.createdAddress) return t('status.vault')
    return t('status.idle')
  }, [connectStatus, t, wallet.connectedAddress, wallet.createdAddress])

  const vaultNetworkLabel = wallet.chainName ?? (wallet.connectedAddress ? 'EVM' : '—')
  const vaultConnectorLabel =
    wallet.connectorName ?? (wallet.connectedAddress ? t('unknownConnector') : '—')

  const selectedXrplNetwork = XRPL_NETWORKS_BY_ID[selectedXrplNetworkId]
  const xrplBadgeTone = selectedXrplNetwork.isProduction
    ? 'bg-red-400'
    : selectedXrplNetwork.canResetWithoutWarning
      ? 'bg-amber-300'
      : 'bg-emerald-400'

  return (
    <motion.aside
      initial={false}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      className="fixed right-4 top-20 z-50 w-[260px] select-none sm:right-6 sm:top-24 sm:w-[280px] lg:right-8 lg:top-24 lg:w-[300px]"
    >
      <div className="surface-panel panel-glow-saffron rounded-[18px]">
        <div className="rounded-t-[18px] border-b border-white/10 bg-white/5 p-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-gradient-to-br from-[#c7794a] via-[#e0bf7f] to-[#4b9577] p-[1px]">
                <div
                  className={`flex h-full w-full items-center justify-center rounded-full text-xs font-semibold ${
                    isLightTheme ? 'bg-white/85 text-[#1d2f45]/90' : 'bg-black/80 text-ivory/80'
                  }`}
                >
                  {(primaryLine[0] ?? 'G').toUpperCase()}
                </div>
              </div>

              <div className="min-w-0">
                <div className="truncate text-sm font-semibold tracking-tight text-ivory">{primaryLine}</div>
                <div className="truncate text-[11px] tracking-wide text-ivory/60">{secondaryLine}</div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div
                suppressHydrationWarning
                className="text-[11px] font-semibold tabular-nums tracking-tight text-ivory"
              >
                {timeLabel}
              </div>
              <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-ivory/80">
                <StatusDot tone={statusTone} />
                <span className="whitespace-nowrap">{statusLabel}</span>
              </div>
            </div>
          </div>

          {lastEvent ? (
            <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-ivory/70">
              <span className="font-semibold text-ivory/80">{t('signal')}:</span> {lastEvent.message}
            </div>
          ) : null}

          <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-[11px]">
            <span className="uppercase tracking-[0.16em] text-ivory/55">{t('xrplNetwork')}</span>
            <a
              href="#xrpl-network"
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 font-semibold tracking-wide text-ivory/85 transition hover:bg-white/10"
            >
              <span className={`h-1.5 w-1.5 rounded-full ${xrplBadgeTone}`} />
              {selectedXrplNetwork.name}
            </a>
          </div>
        </div>

        <div className="p-3">
          <AnimatePresence mode="wait" initial={false}>
            {hovered ? (
              <motion.div
                key="expanded"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.18 }}
                className="space-y-3"
              >
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-ivory/50">{t('vaultSession')}</div>
                  <div className="mt-2 grid gap-2 text-[11px] text-ivory/75">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-ivory/50">{t('wallet')}</span>
                      <span className="font-mono text-ivory/80">
                        {wallet.connectedAddress
                          ? formatShortAddress(wallet.connectedAddress)
                          : wallet.createdAddress
                            ? formatShortAddress(wallet.createdAddress)
                            : '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-ivory/50">{t('network')}</span>
                      <span className="truncate text-ivory/80">{vaultNetworkLabel}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-ivory/50">{t('connectionMethod')}</span>
                      <span className="truncate text-ivory/80">{vaultConnectorLabel}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-ivory/50">{t('sessionStatus')}</span>
                      <span className="text-ivory/80">{vaultSessionLabel}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <IconButton
                      label="Copy Address"
                      isLight={isLightTheme}
                      onClick={() => {
                        if (!copyText) return
                        void navigator.clipboard.writeText(copyText)
                        pushEvent({ kind: 'success', message: 'Copied to clipboard.' })
                      }}
                    >
                      <CopyIcon />
                    </IconButton>
                    <IconButton label="X" href="https://x.com" isLight={isLightTheme}>
                      <XIcon />
                    </IconButton>
                    <IconButton label="LinkedIn" href="https://linkedin.com" isLight={isLightTheme}>
                      <LinkedinIcon />
                    </IconButton>
                    <IconButton label="GitHub" href="https://github.com" isLight={isLightTheme}>
                      <GithubIcon />
                    </IconButton>
                  </div>

                  <div
                    aria-hidden="true"
                    className={`h-5 w-px ${
                      isLightTheme ? 'bg-gradient-to-b from-transparent via-[#7fa3c1]/45 to-transparent' : 'bg-gradient-to-b from-transparent via-white/25 to-transparent'
                    }`}
                  />
                  <a
                    href="#xrpl-network"
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.16em] transition ${
                      isLightTheme
                        ? 'border-[#7fa3c1]/45 bg-white/70 text-[#3a5673]/85 hover:bg-white'
                        : 'border-white/10 bg-white/5 text-ivory/70 hover:bg-white/10'
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${xrplBadgeTone}`} />
                    {selectedXrplNetwork.name}
                  </a>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="collapsed"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.18 }}
                className="flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <IconButton label="X" href="https://x.com" isLight={isLightTheme}>
                    <XIcon />
                  </IconButton>
                  <IconButton label="LinkedIn" href="https://linkedin.com" isLight={isLightTheme}>
                    <LinkedinIcon />
                  </IconButton>
                  <IconButton label="GitHub" href="https://github.com" isLight={isLightTheme}>
                    <GithubIcon />
                  </IconButton>
                </div>

                <div
                  aria-hidden="true"
                  className={`h-5 w-px ${
                    isLightTheme ? 'bg-gradient-to-b from-transparent via-[#7fa3c1]/45 to-transparent' : 'bg-gradient-to-b from-transparent via-white/25 to-transparent'
                  }`}
                />

                <div
                  className={`rounded-full border px-3 py-1 text-[11px] font-semibold tracking-wide ${
                    isLightTheme
                      ? 'border-[#7fa3c1]/45 bg-white/70 text-[#36516d]/85'
                      : 'border-white/10 bg-white/5 text-ivory/70'
                  }`}
                >
                  {t('expand')}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.aside>
  )
}
