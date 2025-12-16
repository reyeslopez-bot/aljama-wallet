// app/page.tsx
'use client'

import { CreateWalletPanel } from '@/components/home/CreateWalletPanel'
import { FeatureShowcase } from '@/components/home/FeatureShowcase'
import WalletDetector from '@/components/wallet/ui/WalletDetector'
import { useTrackUserWallet } from '@/infra/utils/useTrackUserWallet'

const statBlocks = [
  { label: 'Mainnet posture', value: 'EVM-First', detail: 'Wagmi + Ethers production stack' },
  { label: 'Security model', value: 'Session-local', detail: 'Encrypted, no remote custody' },
  { label: 'UX philosophy', value: 'Frictionless', detail: 'Zero clutter, guided flows' },
]

// unified surface tokens (Option A)
const SURFACE = 'bg-black/70'
const SURFACE_SOFT = 'bg-black/60'
const SURFACE_BORDER = 'border border-white/10'
const SURFACE_SHADOW = 'shadow-2xl'
const SURFACE_INNER = 'shadow-inner'

export default function HomePage() {
  useTrackUserWallet()

  return (
    <div className="relative mx-auto max-w-7xl space-y-24 pb-32 pt-28">
      {/* HERO */}
      <section className={`relative p-14 ${SURFACE} ${SURFACE_BORDER} shadow-[0_40px_120px_rgba(0,0,0,0.9)]`}>
        {/* brass accent line */}
        <div className="absolute left-0 top-0 h-[2px] w-full bg-gradient-to-r from-transparent via-[#c9a24d] to-transparent" />

        <div className="relative z-10 max-w-3xl space-y-8">
          <p className="text-sm uppercase tracking-[0.25em] text-[#c9a24d]/90">Aljama Wallet</p>

          <h1 className="text-5xl font-semibold leading-tight tracking-tight text-white">
            Wealth-grade self custody for a desert age.
          </h1>

          <p className="text-lg text-white/70">
            Create encrypted session vaults, move across EVM networks, and maintain full sovereign control without onboarding noise.
          </p>

          <div className="grid gap-6 pt-6 sm:grid-cols-3">
            {statBlocks.map((stat) => (
              <div
                key={stat.label}
                className={`${SURFACE_SOFT} ${SURFACE_BORDER} p-6 ${SURFACE_INNER}`}
              >
                <p className="text-xs uppercase tracking-wider text-white/40">{stat.label}</p>
                <p className="mt-3 text-2xl font-medium text-white">{stat.value}</p>
                <p className="mt-1 text-sm text-white/60">{stat.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CORE INTERFACE */}
      <section className="grid gap-20 lg:grid-cols-2">
        <div className={`${SURFACE} ${SURFACE_BORDER} p-12 ${SURFACE_SHADOW}`}>
          <CreateWalletPanel />
        </div>

        <div className={`${SURFACE} ${SURFACE_BORDER} p-12 ${SURFACE_SHADOW}`}>
          <FeatureShowcase />
        </div>
      </section>

      {/* FLOATING WALLET DETECTOR */}
      <div className="fixed bottom-8 right-8 z-40">
        <WalletDetector />
      </div>
    </div>
  )
}
