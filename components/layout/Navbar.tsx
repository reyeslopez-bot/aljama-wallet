// components/layout/Navbar.tsx
'use client'

import WalletButton from '@/components/wallet/ui/WalletButton'
import { BRAND } from '@/constants/brand'
import { usePathname } from 'next/navigation'

export default function Navbar() {
  const pathname = usePathname()
  const hideWallet = pathname.startsWith('/unlock')

  return (
    <nav
      className="
        fixed top-0 left-0 right-0 z-50
        px-4 py-4
        flex items-center justify-between
        text-white
        border-b border-white/10
        bg-black/50 backdrop-blur-xl
        shadow-[0_10px_30px_rgba(0,0,0,0.45)]
      "
    >
      <div className="text-lg font-semibold tracking-[0.2em] text-amber-100/90">
        {BRAND.name}
      </div>

      {!hideWallet ? <WalletButton /> : null}
    </nav>
  )
}
