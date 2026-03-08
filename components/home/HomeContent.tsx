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
      aria-labelledby="home-overview-title"
      aria-describedby="home-overview-subtitle"
      className={`relative scroll-mt-28 ${SURFACE} panel-glow-saffron overflow-hidden p-12 md:p-14`}
    >
      <div
        aria-hidden="true"
        className="ethereal-orb absolute -left-14 top-18 h-40 w-40 bg-saffron/14 [animation:aurora-drift_18s_ease-in-out_infinite]"
      />
      <div
        aria-hidden="true"
        className="ethereal-orb absolute -right-10 bottom-[-3.5rem] h-56 w-56 bg-lapis/16 [animation:aurora-drift_24s_ease-in-out_infinite_reverse]"
      />
      <div className="absolute inset-x-10 top-6 ornament-line" />
      <div className="pointer-events-none absolute inset-y-12 right-[14%] w-px bg-gradient-to-b from-white/0 via-white/12 to-white/0" />
      <div className="pointer-events-none absolute right-8 top-8 h-24 w-24 rounded-full border border-white/10 bg-white/[0.04] shadow-[0_0_60px_rgba(126,170,211,0.12)]" />

      <div className="relative z-10 w-full space-y-8">
        <p className="ethereal-pill inline-flex w-fit items-center px-4 py-1.5 text-xs uppercase tracking-[0.35em] text-saffron/80">
          {BRAND.name}
        </p>

        <h1
          id="home-overview-title"
          className="max-w-4xl font-display text-4xl font-semibold leading-tight tracking-tight text-ivory sm:text-5xl"
        >
          {title}
        </h1>

        <p id="home-overview-subtitle" className="max-w-3xl text-lg text-ivory/80">
          {subtitle}
        </p>

        <HomeActionButtons />

        <div className="grid gap-5 pt-6 sm:grid-cols-3" role="list" aria-label="Wallet highlights">
          {statBlocks.map((stat) => (
            <div key={stat.id} role="listitem" className={`${SURFACE_SOFT} relative overflow-hidden p-5`}>
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-white/0 via-white/18 to-white/0"
              />
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
    <section
      id="demo"
      data-testid="home-region-map-section"
      aria-label="Region awareness and compliance"
      className="grid scroll-mt-28 gap-12 xl:gap-16 lg:grid-cols-2"
    >
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
    <section
      id="wallet"
      data-testid="home-wallet-section"
      aria-label="Wallet creation and connection"
      className="grid scroll-mt-28 items-start gap-8 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.95fr)]"
    >
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
    <section
      id="xrpl"
      data-testid="home-xrpl-section"
      aria-label="XRPL network and market"
      className="grid scroll-mt-28 gap-12 xl:gap-16 lg:grid-cols-2"
    >
      <XrplPanel />
      <XrplMarketPanel />
    </section>
  )
}

function TradeDeskSection() {
  return (
    <section
      id="trade-desk"
      data-testid="home-trade-desk-section"
      aria-label="XRPL trade desk"
      className="scroll-mt-28"
    >
      <XrplTradeDesk />
    </section>
  )
}

function ShareSection() {
  return <ShareDock />
}

function FooterCopyright() {
  const year = new Date().getFullYear()
  return (
    <footer className="relative flex justify-center pt-8">
      <div
        aria-hidden="true"
        className="ethereal-orb absolute top-0 h-24 w-[min(34rem,82vw)] bg-lapis/14 [animation:aurora-drift_22s_ease-in-out_infinite]"
      />
      <span
        aria-label={`Copyright ${year} ${BRAND.name}`}
        className="ethereal-pill relative inline-flex items-center gap-3 px-5 py-2.5 text-sm font-semibold tracking-[0.16em] text-ivory/78 sm:text-base"
      >
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-saffron/75 shadow-[0_0_16px_rgba(210,167,98,0.55)]" />
        <span>© {year} {BRAND.name}</span>
      </span>
    </footer>
  )
}

export default function HomeContent() {
  const tHome = useTranslations('home')
  const showDevDeviation = process.env.NODE_ENV === 'development'

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
    <div
      data-dev-deviation={showDevDeviation ? 'true' : undefined}
      className="relative mx-auto max-w-7xl space-y-16 pb-32 pt-28 lg:space-y-20"
    >
      <div aria-hidden="true" className="ethereal-orb absolute -top-10 left-[-5rem] h-72 w-72 bg-saffron/10" />
      <div aria-hidden="true" className="ethereal-orb absolute top-56 right-[-6rem] h-80 w-80 bg-lapis/12" />
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
      <FooterCopyright />
    </div>
  )
}
