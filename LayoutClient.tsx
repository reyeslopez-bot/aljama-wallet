'use client'

import { WagmiConfig } from 'wagmi'
import { wagmiConfig } from '@/lib/wagmi'

export default function LayoutClient({ children }: { children: React.ReactNode }) {
    return (
        <WagmiConfig config={wagmiConfig}>
            <main className="flex-1">
                {children}
            </main>
        </WagmiConfig>
    )
}

