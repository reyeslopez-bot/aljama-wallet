'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import HomeStageShell from '@/components/home/HomeStageShell.client'
import { CreateWalletPanel } from '@/components/home/CreateWalletPanel'
import { ConnectWalletPanel } from '@/components/home/ConnectWalletPanel.client'

type WalletAccessMode = 'create' | 'connect'

const MOBILE_LAYOUT_QUERY = '(max-width: 1279px)'

function resolveWalletAccessMode(hash: string, modeParam: string | null): WalletAccessMode {
  if (hash === '#connect') return 'connect'
  if (hash === '#create') return 'create'
  if (modeParam === 'login') return 'connect'
  return 'create'
}

function MobileWalletAccessShell({
  activePanel,
  onSelectPanel,
}: {
  activePanel: WalletAccessMode
  onSelectPanel: (mode: WalletAccessMode) => void
}) {
  const tActions = useTranslations('actions')
  const tCreate = useTranslations('createWallet')
  const tConnect = useTranslations('connectWallet')

  const isCreate = activePanel === 'create'
  const eyebrow = isCreate ? tCreate('eyebrow') : tConnect('eyebrow')
  const title = isCreate ? tCreate('title') : tConnect('title')
  const body = isCreate ? tCreate('body') : tConnect('body')

  return (
    <div data-testid="wallet-access-mobile-shell" className="space-y-4 xl:hidden">
      <div className="surface-panel relative overflow-hidden p-4">
        <div className="absolute inset-x-6 top-4 ornament-line" />

        <div className="relative">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.22em] text-saffron/75">{eyebrow}</p>
              <h3 className="mt-3 font-display text-[1.65rem] font-semibold leading-tight text-ivory">
                {title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ivory/72">{body}</p>
            </div>
            <span className="rounded-full border border-white/12 bg-white/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-ivory/60">
              {isCreate ? tActions('createWallet') : tActions('connectWallet')}
            </span>
          </div>

          <div
            role="tablist"
            aria-label="Wallet access modes"
            className="mt-4 grid grid-cols-2 gap-2 rounded-[1.25rem] border border-white/10 bg-black/20 p-1.5"
          >
            <button
              data-testid="wallet-access-tab-create"
              id="wallet-access-tab-create"
              type="button"
              role="tab"
              aria-selected={isCreate}
              aria-controls="wallet-access-mobile-create-panel"
              onClick={() => onSelectPanel('create')}
              className={`rounded-[1rem] px-4 py-3 text-sm font-semibold tracking-wide transition ${
                isCreate
                  ? 'bg-gradient-to-r from-[#f0d7a0] via-[#dda469] to-[#c7794a] text-[#20140e] shadow-lg shadow-[#c7794a]/20'
                  : 'text-ivory/70 hover:bg-white/5'
              }`}
            >
              {tActions('createWallet')}
            </button>
            <button
              data-testid="wallet-access-tab-connect"
              id="wallet-access-tab-connect"
              type="button"
              role="tab"
              aria-selected={!isCreate}
              aria-controls="wallet-access-mobile-connect-panel"
              onClick={() => onSelectPanel('connect')}
              className={`rounded-[1rem] px-4 py-3 text-sm font-semibold tracking-wide transition ${
                !isCreate
                  ? 'bg-gradient-to-r from-[#7fb0d9] via-[#5c8db4] to-[#4b7c79] text-ivory shadow-lg shadow-[#4b7c79]/20'
                  : 'text-ivory/70 hover:bg-white/5'
              }`}
            >
              {tActions('connectWallet')}
            </button>
          </div>
        </div>
      </div>

      <div id="create" className="app-scroll-offset" />
      <div
        id="wallet-access-mobile-create-panel"
        data-testid="wallet-access-mobile-create"
        role="tabpanel"
        aria-labelledby="wallet-access-tab-create"
        hidden={!isCreate}
        className="space-y-4"
      >
        <CreateWalletPanel />
      </div>

      <div id="connect" className="app-scroll-offset" />
      <div
        id="wallet-access-mobile-connect-panel"
        data-testid="wallet-access-mobile-connect"
        role="tabpanel"
        aria-labelledby="wallet-access-tab-connect"
        hidden={isCreate}
        className="space-y-4"
      >
        <ConnectWalletPanel />
      </div>
    </div>
  )
}

function DesktopWalletAccessShell() {
  return (
    <div
      data-testid="wallet-access-desktop-shell"
      className="grid items-start gap-8 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.95fr)]"
    >
      <div>
        <div id="create" className="app-scroll-offset">
          <CreateWalletPanel />
        </div>
      </div>

      <div>
        <div id="connect" className="app-scroll-offset">
          <ConnectWalletPanel />
        </div>
      </div>
    </div>
  )
}

export default function WalletAccessSection() {
  const searchParams = useSearchParams()
  const modeParam = searchParams.get('mode')
  const [isMobileLayout, setIsMobileLayout] = useState(false)
  const [activePanel, setActivePanel] = useState<WalletAccessMode>('create')

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return

    const mediaQuery = window.matchMedia(MOBILE_LAYOUT_QUERY)
    const syncLayout = () => setIsMobileLayout(mediaQuery.matches)

    syncLayout()

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', syncLayout)
      return () => mediaQuery.removeEventListener('change', syncLayout)
    }

    mediaQuery.addListener(syncLayout)
    return () => mediaQuery.removeListener(syncLayout)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const syncPanel = () => {
      setActivePanel(resolveWalletAccessMode(window.location.hash, modeParam))
    }

    syncPanel()
    window.addEventListener('hashchange', syncPanel)
    return () => window.removeEventListener('hashchange', syncPanel)
  }, [modeParam])

  const selectPanel = (mode: WalletAccessMode) => {
    setActivePanel(mode)

    if (typeof window === 'undefined') return

    const url = new URL(window.location.href)
    url.hash = mode
    window.history.replaceState(window.history.state, '', url.toString())

    window.requestAnimationFrame(() => {
      document.getElementById(mode)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  return (
    <section
      id="wallet"
      data-testid="home-wallet-section"
      data-home-reveal="wallet"
      data-home-route-stop="wallet"
      aria-label="Wallet creation and connection"
      className="app-scroll-offset space-y-6"
    >
      <HomeStageShell>
        {isMobileLayout ? (
          <MobileWalletAccessShell activePanel={activePanel} onSelectPanel={selectPanel} />
        ) : (
          <DesktopWalletAccessShell />
        )}
      </HomeStageShell>
    </section>
  )
}
