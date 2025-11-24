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
    <div className="relative flex flex-col items-center gap-6 pb-16">
      <FogParticleOverlay />
      <FloatingSigils />
      <TitleCalligraphy />
      <HeroCard />

      <div className="absolute bottom-4 right-4 z-50 opacity-80">
        <WalletDetector />
      </div>
    </div>
  )
}
