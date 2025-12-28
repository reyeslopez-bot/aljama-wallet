// components/wallet/ui/WalletDetectorShell.tsx
'use client'

import ClientOnly from '@/app/ClientOnly'
import WalletDetector from '@/components/wallet/ui/WalletDetector'
import WalletShellSkeleton from '@/components/wallet/ui/WalletShellSkeleton'

export default function WalletDetectorShell() {
  return (
    <ClientOnly fallback={<WalletShellSkeleton />}>
      <WalletDetector />
    </ClientOnly>
  )
}
