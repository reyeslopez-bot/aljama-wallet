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

function HeroRouteStage() {
  return (
    <div
      data-testid="home-hero-stage"
      data-home-hero-stage="true"
      aria-hidden="true"
      className="home-hero-stage surface-inner relative min-h-[320px] overflow-hidden rounded-[2rem] p-5 sm:min-h-[360px] sm:p-6 lg:min-h-[430px] lg:p-7 [transform-style:preserve-3d]"
    >
      <div className="absolute inset-4 rounded-[1.65rem] border border-white/8 bg-white/[0.02]" />
      <div data-home-hero-grid="true" className="home-route-veil absolute inset-5 rounded-[1.5rem]" />
      <div data-home-hero-scan="true" className="home-route-scan absolute inset-0" />

      <div data-home-hero-badge className="home-route-badge absolute left-5 top-5 w-32 sm:w-36">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-saffron/80 shadow-[0_0_18px_rgba(210,167,98,0.5)]" />
          <span className="h-px flex-1 bg-gradient-to-r from-saffron/75 to-transparent" />
        </div>
        <div className="mt-3 space-y-2">
          <span className="block h-1.5 rounded-full bg-white/12" />
          <span className="block h-1.5 w-4/5 rounded-full bg-lapis/30" />
        </div>
      </div>

      <div data-home-hero-core="true" className="absolute inset-0">
        <svg
          viewBox="0 0 360 300"
          className="absolute inset-0 h-full w-full"
          fill="none"
        >
          <path
            data-home-hero-route-glow
            d="M54 238C84 214 106 200 132 184C163 164 190 146 208 114C224 86 243 72 282 60"
            stroke="rgba(210,167,98,0.2)"
            strokeWidth="18"
            strokeLinecap="round"
          />
          <path
            data-home-hero-route-path
            d="M54 238C84 214 106 200 132 184C163 164 190 146 208 114C224 86 243 72 282 60"
            stroke="url(#home-hero-route-gradient)"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeDasharray="5 7"
          />
          <defs>
            <linearGradient id="home-hero-route-gradient" x1="42" y1="244" x2="294" y2="52" gradientUnits="userSpaceOnUse">
              <stop stopColor="#d2a762" />
              <stop offset="0.5" stopColor="#7fb0d9" />
              <stop offset="1" stopColor="#5c987c" />
            </linearGradient>
          </defs>

          {[
            { x: 54, y: 238 },
            { x: 132, y: 184 },
            { x: 206, y: 118 },
            { x: 282, y: 60 },
          ].map((point, index) => (
            <g
              key={`${point.x}-${point.y}`}
              data-home-hero-marker
              transform={`translate(${point.x} ${point.y})`}
            >
              <circle r="18" fill={index % 2 === 0 ? 'rgba(210,167,98,0.08)' : 'rgba(127,176,217,0.08)'} />
              <rect
                x="-7"
                y="-7"
                width="14"
                height="14"
                rx="3"
                transform="rotate(45)"
                fill={index % 2 === 0 ? '#d2a762' : index === 4 ? '#5c987c' : '#7fb0d9'}
              />
              <circle r="3.5" fill="#fff5e5" />
            </g>
          ))}
        </svg>
      </div>

      <div className="absolute bottom-5 left-5 right-5">
        <div data-home-hero-badge className="home-route-badge px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-saffron/80" />
            <span className="h-px flex-1 bg-gradient-to-r from-saffron/65 to-transparent" />
          </div>
          <div className="mt-3 space-y-2">
            <span className="block h-1.5 w-4/5 rounded-full bg-white/12" />
            <span className="block h-1.5 w-full rounded-full bg-lapis/25" />
          </div>
        </div>
      </div>
    </div>
  )
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
      className={`relative scroll-mt-28 ${SURFACE} panel-glow-saffron overflow-hidden p-12 md:p-14`}
    >
      <div className="absolute inset-x-10 top-6 ornament-line" />
      <div className="absolute left-[-4rem] top-8 h-32 w-32 rounded-full bg-[radial-gradient(circle,rgba(210,167,98,0.18),rgba(210,167,98,0)_70%)] blur-2xl" />
      <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-52 md:block" aria-hidden="true">
        <div
          data-home-hero-accent
          className="absolute right-12 top-16 h-24 w-24 rounded-full border border-saffron/12"
        />
        <div
          data-home-hero-accent
          className="absolute right-24 top-27 h-2.5 w-2.5 rounded-full bg-saffron/72 shadow-[0_0_18px_rgba(210,167,98,0.34)]"
        />
      </div>

      <div className="relative z-10 w-full space-y-8">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)] lg:items-center">
          <div data-home-hero-copy="true" className="space-y-8">
            <div className="space-y-4">
              <p className="text-xs uppercase tracking-[0.35em] text-saffron/80">{BRAND.name}</p>
              <div className="flex flex-wrap gap-2">
                {['XRPL', 'EVM', 'MENA'].map((label) => (
                  <span
                    key={label}
                    data-home-hero-badge
                    className="home-route-badge rounded-full px-3 py-1.5 text-[10px] uppercase tracking-[0.24em] text-ivory/72"
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>

            <h1
              id="home-overview-title"
              className="max-w-3xl font-display text-4xl font-semibold leading-tight tracking-tight text-ivory sm:text-5xl lg:text-[3.7rem]"
            >
              {title}
            </h1>

            <p id="home-overview-subtitle" className="max-w-2xl text-lg text-ivory/82">
              {subtitle}
            </p>

            <div data-home-hero-actions="true" className="max-w-2xl">
              <HomeActionButtons />
            </div>
          </div>

          <HeroRouteStage />
        </div>

        <div className="grid gap-5 pt-4 sm:grid-cols-3" role="list" aria-label="Wallet highlights">
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

function ShareSection() {
  return (
    <div data-home-reveal="share" data-home-route-stop="share">
      <ShareDock />
    </div>
  )
}

function FooterCopyright() {
  const year = new Date().getFullYear()
  return (
    <footer data-home-reveal="footer" data-home-route-stop="footer" className="flex justify-center pt-4">
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
