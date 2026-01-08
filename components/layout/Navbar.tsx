// components/layout/Navbar.tsx
'use client'

import { usePathname } from 'next/navigation'
import WalletButton from '@/components/wallet/ui/WalletButton'
import { BRAND } from '@/constants/brand'

export default function Navbar() {
  const pathname = usePathname()

  // Wallet UI should ONLY appear on routes where full wagmi config is active
  const walletRoutes =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/wallet') ||
    pathname.startsWith('/swap') ||
    pathname.startsWith('/send')

  const showWallet = walletRoutes

  return (
    <nav
      className="
        fixed inset-x-0 top-0 z-50
        flex items-center justify-between
        px-5 py-3
        text-white
        bg-gradient-to-b
        from-black/80
        via-black/60
        to-transparent
        backdrop-blur
        shadow-[0_6px_30px_rgba(0,0,0,0.45)]
      "
    >
      <div className="text-lg font-semibold tracking-wide">
        {BRAND.name}
      </div>

      {showWallet && <WalletButton />}
    </nav>
  )
}
