'use client'

import FogParticleOverlay from '@/components/hero/FogParticleOverlay'
import HeroCard from '@/components/hero/HeroCard'
import { TitleCalligraphy } from '@/components/hero/TitleCalligraphy'
import { FloatingSigils } from '@/components/hero/FloatingSigils'
import WalletDetector from '@/components/wallet/ui/WalletDetector'
import { useTrackUserWallet } from '@/infra/utils/useTrackUserWallet'

export default function HomePage() {
  useTrackUserWallet()

  return (
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-b from-black/70 via-black/50 to-black/80">
      <FogParticleOverlay />
      <FloatingSigils />
      <TitleCalligraphy />

      <div className="relative z-20 mx-auto flex max-w-6xl flex-col items-center gap-8 px-4 pb-16 pt-12 sm:px-8">
        <HeroCard />
      </div>

      <div className="absolute bottom-4 right-4 z-50 opacity-80">
        <WalletDetector />
      </div>
    </main>
  )
}
