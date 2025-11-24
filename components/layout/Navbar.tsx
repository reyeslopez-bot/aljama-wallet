// components/layout/Navbar.tsx
'use client'

import WalletButton from '@/components/wallet/ui/WalletButton'

export default function Navbar() {
  return (
    <nav
      className="
        fixed top-0 left-0 right-0 z-50
        px-4 py-3
        flex items-center justify-between
        text-white
        bg-gradient-to-b
        from-[#0d0d0d]/70
        via-[#2e1d0f]/40
        to-transparent
        shadow-[0_4px_20px_rgba(0,0,0,0.35)]
      "
    >
      <div className="text-xl font-semibold tracking-wide">
        Aljama Wallet
      </div>

      <WalletButton />
    </nav>
  )
}
