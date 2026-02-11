'use client'

import { AnimatePresence, motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useDynamicInfoStore } from '@/hooks/useDynamicInfoStore'

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
  children: ReactNode
}) {
  const className =
    'inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-ivory/70 transition hover:bg-white/10 hover:text-ivory focus:outline-none focus:ring-2 focus:ring-saffron/30'

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
  const [hovered, setHovered] = useState(false)
  const [now, setNow] = useState(() => new Date())

  const user = useDynamicInfoStore((s) => s.user)
  const wallet = useDynamicInfoStore((s) => s.wallet)
  const createStatus = useDynamicInfoStore((s) => s.createWalletStatus)
  const connectStatus = useDynamicInfoStore((s) => s.connectWalletStatus)
  const trackingStatus = useDynamicInfoStore((s) => s.trackingStatus)
  const trackingError = useDynamicInfoStore((s) => s.trackingError)
  const lastEvent = useDynamicInfoStore((s) => s.lastEvent)
  const pushEvent = useDynamicInfoStore((s) => s.pushEvent)

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(t)
  }, [])

  const timeLabel = useMemo(
    () =>
      now.toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
      }),
    [now],
  )

  const statusTone: 'ok' | 'warn' | 'bad' | 'idle' = useMemo(() => {
    if (createStatus === 'error' || connectStatus === 'error') return 'bad'
    if (createStatus === 'pending' || connectStatus === 'pending' || trackingStatus === 'pending') return 'warn'
    if (wallet.connectedAddress) return 'ok'
    return 'idle'
  }, [connectStatus, createStatus, trackingStatus, wallet.connectedAddress])

  const statusLabel = useMemo(() => {
    if (createStatus === 'pending') return 'Creating'
    if (connectStatus === 'pending') return 'Syncing'
    if (createStatus === 'error' || connectStatus === 'error') return 'Action needed'
    if (wallet.connectedAddress) return 'Available'
    if (wallet.createdAddress) return 'Vault'
    return 'Idle'
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
                <div className="flex h-full w-full items-center justify-center rounded-full bg-black/80 text-xs font-semibold text-ivory/80">
                  {(primaryLine[0] ?? 'G').toUpperCase()}
                </div>
              </div>

              <div className="min-w-0">
                <div className="truncate text-sm font-semibold tracking-tight text-ivory">{primaryLine}</div>
                <div className="truncate text-[11px] tracking-wide text-ivory/60">{secondaryLine}</div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-[11px] font-semibold tabular-nums tracking-tight text-ivory">{timeLabel}</div>
              <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-ivory/80">
                <StatusDot tone={statusTone} />
                <span className="whitespace-nowrap">{statusLabel}</span>
              </div>
            </div>
          </div>

          {lastEvent ? (
            <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-ivory/70">
              <span className="font-semibold text-ivory/80">Signal:</span> {lastEvent.message}
            </div>
          ) : null}
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
                  <div className="text-[11px] uppercase tracking-[0.18em] text-ivory/50">Vault session</div>
                  <div className="mt-2 grid gap-2 text-[11px] text-ivory/75">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-ivory/50">Wallet</span>
                      <span className="font-mono text-ivory/80">
                        {wallet.connectedAddress
                          ? formatShortAddress(wallet.connectedAddress)
                          : wallet.createdAddress
                            ? formatShortAddress(wallet.createdAddress)
                            : '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-ivory/50">Network</span>
                      <span className="truncate text-ivory/80">{wallet.chainName ?? '—'}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-ivory/50">Connector</span>
                      <span className="truncate text-ivory/80">{wallet.connectorName ?? '—'}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-ivory/50">Tracking</span>
                      <span className="text-ivory/80">
                        {trackingStatus}
                        {trackingStatus === 'error' && trackingError ? `: ${trackingError}` : ''}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <IconButton
                      label="Copy Address"
                      onClick={() => {
                        if (!copyText) return
                        void navigator.clipboard.writeText(copyText)
                        pushEvent({ kind: 'success', message: 'Copied to clipboard.' })
                      }}
                    >
                      <CopyIcon />
                    </IconButton>
                    <IconButton label="X" href="https://x.com">
                      <XIcon />
                    </IconButton>
                    <IconButton label="LinkedIn" href="https://linkedin.com">
                      <LinkedinIcon />
                    </IconButton>
                    <IconButton label="GitHub" href="https://github.com">
                      <GithubIcon />
                    </IconButton>
                  </div>

                  <div className="text-[10px] uppercase tracking-[0.2em] text-ivory/40">Hover view</div>
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
                  <IconButton label="X" href="https://x.com">
                    <XIcon />
                  </IconButton>
                  <IconButton label="LinkedIn" href="https://linkedin.com">
                    <LinkedinIcon />
                  </IconButton>
                  <IconButton label="GitHub" href="https://github.com">
                    <GithubIcon />
                  </IconButton>
                </div>

                <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold tracking-wide text-ivory/70">
                  Expand on hover
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.aside>
  )
}
