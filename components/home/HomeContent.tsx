// app/(site)/components/home/HomeContent.tsx

// Server Component (NO 'use client')
import MapboxMap from '@/components/ui/MapboxMap.client'
import { CreateWalletPanel } from '@/components/home/CreateWalletPanel'
import HomeActionButtons from '@/components/home/HomeActionButtons.client'
import { ConnectWalletPanel } from '@/components/home/ConnectWalletPanel.client'
import { XrplPanel } from '@/components/home/XrplPanel.client'
import XrplMarketPanel from '@/components/home/XrplMarketPanel.client'
import XrplTradeDesk from '@/components/home/XrplTradeDesk.client'
import RegionCompliancePanel from '@/components/home/RegionCompliancePanel.client'
import ShareDock from '@/components/home/ShareDock.client'
import ClientTrackWallet from '@/infra/utils/ClientTrackWallet'
import { BRAND } from '@/constants/brand'
import DynamicInfoCard from '@/components/home/DynamicInfoCard.client'
import { useTranslations } from 'next-intl'

const SURFACE = 'surface-panel'
const SURFACE_SOFT = 'surface-soft'

export default function HomeContent() {
  const tHome = useTranslations('home')

  const statBlocks = [
    {
      label: tHome('stats.mainnetLabel'),
      value: tHome('stats.mainnetValue'),
      detail: tHome('stats.mainnetDetail'),
    },
    {
      label: tHome('stats.securityLabel'),
      value: tHome('stats.securityValue'),
      detail: tHome('stats.securityDetail'),
    },
    {
      label: tHome('stats.uxLabel'),
      value: tHome('stats.uxValue'),
      detail: tHome('stats.uxDetail'),
    },
  ]

  return (
    <div className="relative mx-auto max-w-7xl space-y-24 pb-32 pt-28">
      <ClientTrackWallet />
      <DynamicInfoCard />

      {/* ================= HERO / OVERVIEW ================= */}
      <section
        id="overview"
        className={`relative scroll-mt-28 ${SURFACE} panel-glow-saffron overflow-hidden p-12 md:p-14`}
      >
        <div className="absolute inset-x-10 top-6 ornament-line" />
        <div className="absolute right-10 top-10 h-20 w-20 rounded-[28px] border border-white/10 bg-white/5 opacity-40 rotate-12" />

        <div className="relative z-10 max-w-3xl space-y-8">
          <p className="text-xs uppercase tracking-[0.35em] text-saffron/80">{BRAND.name}</p>

          <h1 className="font-display text-4xl font-semibold leading-tight tracking-tight text-ivory sm:text-5xl">
            {tHome('hero.title')}
          </h1>

          <p className="text-lg text-ivory/70">{tHome('hero.subtitle')}</p>

          <HomeActionButtons />

          <div className="grid gap-5 pt-6 sm:grid-cols-3">
            {statBlocks.map((stat) => (
              <div key={stat.label} className={`${SURFACE_SOFT} p-5`}>
                <p className="text-[11px] uppercase tracking-[0.2em] text-ivory/45">{stat.label}</p>
                <p className="mt-3 text-2xl font-semibold text-ivory">{stat.value}</p>
                <p className="mt-1 text-sm text-ivory/60">{stat.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= MAP + REGION ================= */}
      <section id="demo" className="grid scroll-mt-28 gap-20 lg:grid-cols-2">
        <div className={`${SURFACE} panel-glow-lapis p-10 md:p-12`}>
          <MapboxMap />
        </div>
        <div className={`${SURFACE} panel-glow-jade p-10 md:p-12`}>
          <RegionCompliancePanel />
        </div>
      </section>

      {/* ================= CREATE + CONNECT ================= */}
      <section className="grid gap-20 lg:grid-cols-2">
        <div id="create" className="scroll-mt-28">
          <CreateWalletPanel />
        </div>
        <div id="connect" className="scroll-mt-28">
          <ConnectWalletPanel />
        </div>
      </section>

      {/* ================= XRPL ================= */}
      <section id="xrpl" className="grid scroll-mt-28 gap-20 lg:grid-cols-2">
        <XrplPanel />
        <XrplMarketPanel />
      </section>

      <section id="trade-desk" className="scroll-mt-28">
        <XrplTradeDesk />
      </section>

      {/* ================= SHARE ================= */}
      <ShareDock />
    </div>
  )
}
