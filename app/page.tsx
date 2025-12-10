'use client'

import { CreateWalletPanel } from '@/components/home/CreateWalletPanel'
import { FeatureShowcase } from '@/components/home/FeatureShowcase'
import FogParticleOverlay from '@/components/hero/FogParticleOverlay'
import { FloatingSigils } from '@/components/hero/FloatingSigils'
import { TitleCalligraphy } from '@/components/hero/TitleCalligraphy'
import WalletDetector from '@/components/wallet/ui/WalletDetector'
import { useTrackUserWallet } from '@/infra/utils/useTrackUserWallet'

const statBlocks = [
  {
    label: 'Ready for mainnet',
    value: 'EVM-first',
    detail: 'Wagmi + Ethers wired for production flows',
  },
  {
    label: 'Security posture',
    value: 'Toy-safe',
    detail: 'Encrypted locally with session handoff for demos',
  },
  {
    label: 'UX philosophy',
    value: 'Frictionless',
    detail: 'Guided unlocks, optimistic updates, low-latency UI',
  },
]

export default function HomePage() {
  useTrackUserWallet()

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-[#0c0a08] via-[#130f0d] to-[#0a0b0f] text-white">
      <FogParticleOverlay />
      <FloatingSigils />
      <TitleCalligraphy />

      <main className="relative z-10 mx-auto flex max-w-6xl flex-col gap-14 px-6 pb-24 pt-20 lg:pt-28">
        <section className="grid items-start gap-10 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-8">
            <div className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium uppercase tracking-wide text-amber-200/90 shadow-lg backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]" />
              Wallet creation ritual · zero clutter
            </div>

            <header className="space-y-4">
              <h1 className="text-4xl font-semibold leading-tight tracking-tight text-[#f7f0e6] sm:text-5xl lg:text-6xl">
                A calmer way to mint, unlock, and roam the dunes of Web3.
              </h1>
              <p className="max-w-2xl text-lg text-white/80">
                Aljama Wallet blends calligraphy-inspired visuals with modern wagmi wiring.
                Generate wallets, track connections, and surface security posture without
                leaving the landing surface.
              </p>
            </header>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {statBlocks.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-white/0 p-4 shadow-lg backdrop-blur"
                >
                  <p className="text-xs uppercase tracking-[0.15em] text-amber-100/70">{stat.label}</p>
                  <p className="mt-2 text-2xl font-bold text-[#f7f0e6]">{stat.value}</p>
                  <p className="mt-1 text-sm text-white/70">{stat.detail}</p>
                </div>
              ))}
            </div>
          </div>

          <CreateWalletPanel />
        </section>

        <FeatureShowcase />
      </main>

      <div className="fixed bottom-6 right-6 z-40 opacity-90 drop-shadow-xl">
        <WalletDetector />
      </div>
    </div>
  )
}
