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
        fixed top-0 left-0 right-0 z-50
        px-4 py-3
        flex items-center justify-between
        px-5 py-3
        text-white
        bg-gradient-to-b
        from-[#0d0d0d]/70
        via-[#2e1d0f]/40
      "
    >
      <div className="text-xl font-semibold tracking-wide">{BRAND.name}</div>

      {showWallet && <WalletButton />}
    </nav>
  )
}
