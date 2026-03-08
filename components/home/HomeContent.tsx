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
import HomeMotionScene from '@/components/home/HomeMotionScene.client'
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
      data-home-reveal="hero"
      aria-labelledby="home-overview-title"
      aria-describedby="home-overview-subtitle"
      className={`relative scroll-mt-28 ${SURFACE} panel-glow-saffron overflow-hidden p-12 md:p-14`}
    >
      <div className="absolute inset-x-10 top-6 ornament-line" />
      <div className="absolute right-10 top-10 h-20 w-20 rotate-12 rounded-[28px] border border-white/10 bg-white/5 opacity-40" />
      <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-64 md:block" aria-hidden="true">
        <div
          data-home-hero-accent
          className="absolute right-12 top-16 h-28 w-28 rounded-full border border-saffron/18"
        />
        <div
          data-home-hero-accent
          className="absolute right-24 top-28 h-3 w-3 rounded-full bg-saffron/80 shadow-[0_0_22px_rgba(210,167,98,0.5)]"
        />
        <div
          data-home-hero-accent
          className="absolute left-8 bottom-20 h-32 w-32 rounded-full border border-lapis/18"
        />
        <svg
          data-home-hero-accent
          viewBox="0 0 240 120"
          className="absolute bottom-12 left-0 h-28 w-60 text-[#7fb0d9]/40"
          fill="none"
        >
          <path
            d="M10 94C42 86 72 58 105 46C134 35 174 32 230 20"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeDasharray="4 8"
          />
          <circle cx="104" cy="46" r="4" fill="currentColor" />
          <circle cx="172" cy="33" r="3" fill="currentColor" />
        </svg>
      </div>

      <div className="relative z-10 w-full space-y-8">
        <p className="text-xs uppercase tracking-[0.35em] text-saffron/80">{BRAND.name}</p>

        <div data-home-hero-copy="true" className="space-y-8">
          <h1
            id="home-overview-title"
            className="font-display text-4xl font-semibold leading-tight tracking-tight text-ivory sm:text-5xl"
          >
            {title}
          </h1>

          <p id="home-overview-subtitle" className="text-lg text-ivory/82">
            {subtitle}
          </p>

          <div data-home-hero-actions="true">
            <HomeActionButtons />
          </div>
        </div>

        <div className="grid gap-5 pt-6 sm:grid-cols-3" role="list" aria-label="Wallet highlights">
          {statBlocks.map((stat) => (
            <div key={stat.id} data-home-reveal="stat" role="listitem" className={`${SURFACE_SOFT} p-5`}>
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
      data-home-reveal="region"
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
      data-home-reveal="wallet"
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
      data-home-reveal="xrpl"
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
      data-home-reveal="trade-desk"
      aria-label="XRPL trade desk"
      className="scroll-mt-28"
    >
      <XrplTradeDesk />
    </section>
  )
}

function ShareSection() {
  return (
    <div data-home-reveal="share">
      <ShareDock />
    </div>
  )
}

function FooterCopyright() {
  const year = new Date().getFullYear()
  return (
    <footer data-home-reveal="footer" className="flex justify-center pt-4">
      <span
        aria-label={`Copyright ${year} ${BRAND.name}`}
        className="inline-block text-sm font-semibold tracking-[0.08em] text-saffron/75 sm:text-base"
      >
        © {year} {BRAND.name}
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
      data-home-motion-root="true"
      data-dev-deviation={showDevDeviation ? 'true' : undefined}
      className="relative mx-auto max-w-7xl space-y-16 pb-32 pt-28 lg:space-y-20"
    >
      <HomeMotionScene />
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
