// app/(site)/components/home/HomeContent.tsx

// Server Component (NO 'use client')
import MapboxMap from '@/components/ui/MapboxMap.client'
import { CreateWalletPanel } from '@/components/home/CreateWalletPanel'
import { FeatureShowcase } from '@/components/home/FeatureShowcase'
import HomeActionButtons from '@/components/home/HomeActionButtons.client'
import { ConnectWalletPanel } from '@/components/home/ConnectWalletPanel.client'
import { XrplPanel } from '@/components/home/XrplPanel.client'
import ClientTrackWallet from '@/infra/utils/ClientTrackWallet'
import { BRAND } from '@/constants/brand'
import DynamicInfoCard from '@/components/home/DynamicInfoCard.client'

const statBlocks = [
  { label: 'Mainnet posture', value: 'EVM-First', detail: 'Wagmi + Ethers production stack' },
  { label: 'Security model', value: 'Session-local', detail: 'Encrypted, no remote custody' },
  { label: 'UX philosophy', value: 'Frictionless', detail: 'Zero clutter, guided flows' },
]

const SURFACE = 'rounded-3xl border border-white/10 bg-black/60 backdrop-blur-xl'
const SURFACE_SOFT = 'rounded-2xl border border-white/10 bg-white/5'
const SURFACE_SHADOW = 'shadow-2xl shadow-black/40'
const SURFACE_INNER = 'shadow-inner shadow-black/40'

export default function HomeContent() {
  return (
    <div className="relative mx-auto max-w-7xl space-y-24 pb-32 pt-28">
      <ClientTrackWallet />
      <DynamicInfoCard />

      {/* ================= HERO / OVERVIEW ================= */}
      <section
        id="overview"
        className={`relative scroll-mt-28 overflow-hidden p-12 md:p-14 ${SURFACE} shadow-[0_40px_120px_rgba(0,0,0,0.9)]`}
      >
        <div className="absolute left-0 top-0 h-[2px] w-full bg-gradient-to-r from-transparent via-[#c9a24d] to-transparent" />
        <div className="absolute -left-24 -top-24 h-48 w-48 rounded-full bg-[#d96f42]/30 blur-[140px]" />
        <div className="absolute -right-24 bottom-0 h-40 w-40 rounded-full bg-emerald-400/15 blur-[140px]" />

        <div className="relative z-10 max-w-3xl space-y-8">
          <p className="text-sm uppercase tracking-[0.25em] text-[#c9a24d]/90">{BRAND.name}</p>

          <h1 className="text-4xl font-semibold leading-tight tracking-tight text-white sm:text-5xl">
            Wealth-grade self custody for a desert age.
          </h1>

          <p className="text-lg text-white/70">
            Create encrypted session vaults, move across EVM networks, and maintain full sovereign control without onboarding
            noise.
          </p>

          <HomeActionButtons />

          <div className="grid gap-6 pt-6 sm:grid-cols-3">
            {statBlocks.map((stat) => (
              <div key={stat.label} className={`${SURFACE_SOFT} p-6 ${SURFACE_INNER}`}>
                <p className="text-xs uppercase tracking-wider text-white/40">{stat.label}</p>
                <p className="mt-3 text-2xl font-medium text-white">{stat.value}</p>
                <p className="mt-1 text-sm text-white/60">{stat.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= MAP (location + map combined) ================= */}
      <section id="demo" className="scroll-mt-28">
        <div className={`${SURFACE} p-10 md:p-12 ${SURFACE_SHADOW}`}>
          <MapboxMap />
        </div>
      </section>

      {/* ================= CREATE ================= */}
      <section id="create" className="grid scroll-mt-28 gap-20 lg:grid-cols-2">
        <div className={`${SURFACE} p-10 md:p-12 ${SURFACE_SHADOW}`}>
          <CreateWalletPanel />
        </div>
        <div className={`${SURFACE} p-10 md:p-12 ${SURFACE_SHADOW}`}>
          <FeatureShowcase />
        </div>
      </section>

      {/* ================= CONNECT ================= */}
      <section id="connect" className="grid scroll-mt-28 gap-20 lg:grid-cols-2">
        <div className={`${SURFACE} p-10 md:p-12 ${SURFACE_SHADOW}`}>
          <ConnectWalletPanel />
        </div>
        <div className={`${SURFACE} p-10 md:p-12 ${SURFACE_SHADOW}`}>
          <div className="space-y-6">
            <p className="text-xs uppercase tracking-[0.18em] text-amber-100/70">Session Intel</p>
            <h3 className="text-2xl font-semibold text-white">Stay synced with live wallet context.</h3>
            <p className="text-sm text-white/70">
              This panel surfaces RainbowKit + wagmi state so you can verify active connections, swap accounts, and track EVM
              balances without leaving the landing page.
            </p>
            <div className={`${SURFACE_SOFT} p-6 ${SURFACE_INNER}`}>
              <p className="text-xs uppercase tracking-wider text-white/40">Connector status</p>
              <p className="mt-3 text-2xl font-medium text-white">Live</p>
              <p className="mt-1 text-sm text-white/60">WalletConnect, injected, and custom flows remain available.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ================= XRPL ================= */}
      <section id="xrpl" className="grid scroll-mt-28 gap-20 lg:grid-cols-2">
        <div className={`${SURFACE} p-10 md:p-12 ${SURFACE_SHADOW}`}>
          <XrplPanel />
        </div>
        <div className={`${SURFACE} p-10 md:p-12 ${SURFACE_SHADOW}`}>
          <div className="space-y-6">
            <p className="text-xs uppercase tracking-[0.18em] text-amber-100/70">XRPL Integration</p>
            <h3 className="text-2xl font-semibold text-white">Ledger-aware, server-backed.</h3>
            <p className="text-sm text-white/70">
              XRPL balances and account metadata flow through a server proxy so the UI stays secure while still providing
              real-time ledger context.
            </p>
            <div className={`${SURFACE_SOFT} p-6 ${SURFACE_INNER}`}>
              <p className="text-xs uppercase tracking-wider text-white/40">XRPL path</p>
              <p className="mt-3 text-2xl font-medium text-white">Testnet live</p>
              <p className="mt-1 text-sm text-white/60">Wire in mainnet endpoints when ready to ship.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
