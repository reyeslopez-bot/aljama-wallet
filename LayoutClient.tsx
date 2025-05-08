'use client'

import { WagmiConfig } from 'wagmi'
import { wagmiConfig } from '@/lib/wagmi'
import { ReactNode } from 'react'
import { WalletDrawerProvider } from '@/components/wallet/WalletDrawerContext'
import WalletDrawer from '@/components/wallet/WalletDrawer'

export default function LayoutClient({ children }: { children: ReactNode }) {
    return (
        <WagmiConfig config={wagmiConfig}>
            <WalletDrawerProvider>
                <main className="flex-1">{children}</main>
                <WalletDrawer />
            </WalletDrawerProvider>
        </WagmiConfig>
    )
}


