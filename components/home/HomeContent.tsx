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

type HeroStatBlock = {
  id: string
  label: string
  value: string
  detail: string
}

type HeroOverviewSectionProps = {
  title: string
  subtitle: string
  statBlocks: HeroStatBlock[]
}

function HeroOverviewSection({ title, subtitle, statBlocks }: HeroOverviewSectionProps) {
  return (
    <section
      id="overview"
      data-testid="home-overview-section"
      className={`relative scroll-mt-28 ${SURFACE} panel-glow-saffron overflow-hidden p-12 md:p-14`}
    >
      <div className="absolute inset-x-10 top-6 ornament-line" />
      <div className="absolute right-10 top-10 h-20 w-20 rotate-12 rounded-[28px] border border-white/10 bg-white/5 opacity-40" />

      <div className="relative z-10 max-w-flex space-y-8">
        <p className="text-xs uppercase tracking-[0.35em] text-saffron/80">{BRAND.name}</p>

        <h1 className="font-display text-4xl font-semibold leading-tight tracking-tight text-ivory sm:text-5xl">
          {title}
        </h1>

        <p className="text-lg text-ivory/82">{subtitle}</p>

        <HomeActionButtons />

        <div className="grid gap-5 pt-6 sm:grid-cols-3">
          {statBlocks.map((stat) => (
            <div key={stat.id} className={`${SURFACE_SOFT} p-5`}>
              <p className="text-[11px] uppercase tracking-[0.2em] text-saffron/80">{stat.label}</p>
              <p className="mt-3 text-2xl font-semibold text-ivory">{stat.value}</p>
              <p className="mt-2 text-sm leading-relaxed text-ivory/72">{stat.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function RegionAndComplianceSection() {
  return (
    <section id="demo" data-testid="home-region-map-section" className="grid scroll-mt-28 gap-20 lg:grid-cols-2">
      <div className={`${SURFACE} panel-glow-lapis p-10 md:p-12`}>
        <MapboxMap />
      </div>
      <div className={`${SURFACE} panel-glow-jade p-10 md:p-12`}>
        <RegionCompliancePanel />
      </div>
    </section>
  )
}

function WalletAccessSection() {
  return (
    <section data-testid="home-wallet-section" className="grid scroll-mt-28 items-start gap-8 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.95fr)]">
      <div>
        <div id="create" className="scroll-mt-28">
          <CreateWalletPanel />
        </div>
      </div>

      <div>
        <div id="connect" className="scroll-mt-28">
          <ConnectWalletPanel />
        </div>
      </div>
    </section>
  )
}

function XrplSection() {
  return (
    <section id="xrpl" data-testid="home-xrpl-section" className="grid scroll-mt-28 gap-20 lg:grid-cols-2">
      <XrplPanel />
      <XrplMarketPanel />
    </section>
  )
}

function TradeDeskSection() {
  return (
    <section id="trade-desk" data-testid="home-trade-desk-section" className="scroll-mt-28">
      <XrplTradeDesk />
    </section>
  )
}

function ShareSection() {
  return <ShareDock />
}

export default function HomeContent() {
  const tHome = useTranslations('home')

  const statBlocks = [
    {
      id: 'mainnet',
      label: tHome('stats.mainnetLabel'),
      value: tHome('stats.mainnetValue'),
      detail: tHome('stats.mainnetDetail'),
    },
    {
      id: 'security',
      label: tHome('stats.securityLabel'),
      value: tHome('stats.securityValue'),
      detail: tHome('stats.securityDetail'),
    },
    {
      id: 'ux',
      label: tHome('stats.uxLabel'),
      value: tHome('stats.uxValue'),
      detail: tHome('stats.uxDetail'),
    },
  ] satisfies HeroStatBlock[]

  return (
    <div className="relative mx-auto max-w-7xl space-y-24 pb-32 pt-28">
      <ClientTrackWallet />
      <DynamicInfoCard />

      <HeroOverviewSection
        title={tHome('hero.title')}
        subtitle={tHome('hero.subtitle')}
        statBlocks={statBlocks}
      />
      <RegionAndComplianceSection />
      <WalletAccessSection />
      <XrplSection />
      <TradeDeskSection />
      <ShareSection />
    </div>
  )
}
