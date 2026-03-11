// app/(site)/components/home/HomeContent.tsx

// Server Component (NO 'use client')
import MapboxMap from '@/components/ui/MapboxMap.client'
import { CreateWalletPanel } from '@/components/home/CreateWalletPanel'
import HomeActionButtons from '@/components/home/HomeActionButtons.client'
import { ConnectWalletPanel } from '@/components/home/ConnectWalletPanel.client'
import HomeMotionScene from '@/components/home/HomeMotionScene.client'
import { XrplPanel } from '@/components/home/XrplPanel.client'
import XrplMarketPanel from '@/components/home/XrplMarketPanel.client'
import XrplTradeDesk from '@/components/home/XrplTradeDesk.client'
import RegionCompliancePanel from '@/components/home/RegionCompliancePanel.client'
import ShareDock from '@/components/home/ShareDock.client'
import ClientTrackWallet from '@/infra/utils/ClientTrackWallet'
import { BRAND } from '@/constants/brand'
import DynamicInfoCard from '@/components/home/DynamicInfoCard.client'
import { getSiteUrl } from '@/lib/seo/site-url'
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
      data-home-route-stop="overview"
      aria-labelledby="home-overview-title"
      aria-describedby="home-overview-subtitle"
      className={`relative scroll-mt-28 ${SURFACE} panel-glow-saffron overflow-hidden p-8 md:p-10 lg:p-12`}
    >
      <div data-home-hero-accent className="absolute inset-x-10 top-6 ornament-line" />
      <div
        data-home-hero-accent
        className="absolute right-8 top-8 h-16 w-16 rotate-12 rounded-[24px] border border-white/10 bg-white/5 opacity-40 md:right-10 md:top-10 md:h-20 md:w-20 md:rounded-[28px]"
      />

      <div className="relative z-10 w-full space-y-8">
        <div data-home-hero-copy="true" className="max-w-4xl space-y-4 md:space-y-5">
          <p className="text-xs uppercase tracking-[0.35em] text-saffron/80">{BRAND.name}</p>

          <h1
            id="home-overview-title"
            className="font-display text-4xl font-semibold leading-tight tracking-tight text-ivory sm:text-5xl"
          >
            {title}
          </h1>

          <p id="home-overview-subtitle" className="max-w-3xl text-base text-ivory/82 md:text-lg">
            {subtitle}
          </p>
        </div>

        <div
          data-testid="home-overview-visual"
          data-home-hero-stage="true"
          className="home-hero-stage relative overflow-hidden rounded-[1.75rem] border border-white/10 p-5 md:p-6"
        >
          <div data-home-hero-scan="true" className="home-route-scan absolute inset-0" />

          <div className="relative z-10 space-y-5 md:space-y-6">
            <div data-home-hero-actions="true">
              <HomeActionButtons />
            </div>

            <div
              data-testid="home-overview-stat-grid"
              data-home-hero-grid="true"
              className="grid gap-4 sm:grid-cols-3"
              role="list"
              aria-label="Wallet highlights"
            >
              {statBlocks.map((stat) => (
                <div key={stat.id} data-home-reveal="stat" role="listitem" className={`${SURFACE_SOFT} p-4 md:p-5`}>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-saffron/80">{stat.label}</p>
                  <p className="mt-3 text-xl font-semibold text-ivory md:text-2xl">{stat.value}</p>
                  <p className="mt-2 text-sm leading-relaxed text-ivory/72">{stat.detail}</p>
                </div>
              ))}
            </div>
          </div>
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
      data-home-route-stop="region"
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
      data-home-route-stop="wallet"
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
      data-home-route-stop="xrpl"
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
      data-home-route-stop="trade-desk"
      aria-label="XRPL trade desk"
      className="scroll-mt-28"
    >
      <XrplTradeDesk />
    </section>
  )
}

function ShareSection({ initialOrigin }: { initialOrigin: string }) {
  return (
    <section id="share" data-home-reveal="share" data-home-route-stop="share" className="scroll-mt-28">
      <ShareDock initialOrigin={initialOrigin} />
    </section>
  )
}

function FooterCopyright() {
  const year = new Date().getFullYear()
  return (
    <footer data-home-reveal="footer" data-home-route-stop="footer" className="flex justify-center pt-2 md:pt-4">
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
  const initialShareOrigin = getSiteUrl().origin

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
      className="relative mx-auto max-w-7xl space-y-14 pb-28 pt-4 md:pt-6 lg:space-y-16"
    >
      <ClientTrackWallet />
      <DynamicInfoCard />
      <HomeMotionScene />

      <HeroOverviewSection
        title={tHome('hero.title')}
        subtitle={tHome('hero.subtitle')}
        statBlocks={statBlocks}
      />
      <RegionAndComplianceSection />
      <WalletAccessSection />
      <XrplSection />
      <TradeDeskSection />
      <ShareSection initialOrigin={initialShareOrigin} />
      <FooterCopyright />
    </div>
  )
}
