// app/page.tsx
'use client'

import React from 'react'
import { useTrackUserWallet } from '@/hooks/useTrackUserWallet'
import { useWalletDrawer } from '@/components/wallet/WalletDrawerContext'
import Card from '@/components/Card'

export default function HomePage() {
    // Fire off the wallet‐tracking effect on mount
    useTrackUserWallet()

    // Destructure the openDrawer function from context
    const { openDrawer } = useWalletDrawer()

    return (
        <main className="min-h-screen flex flex-col items-center justify-center p-8">
            {/* Page heading */}
            <section className="w-full max-w-5xl text-center mb-12">
                <h1 className="text-5xl font-bold">Welcome to Aljama Wallet</h1>
            </section>

            {/* Cards grid: 1 column on mobile, 2 on small screens, 3 on large */}
            <div
                className="
          w-full max-w-5xl
          grid grid-cols-1
          sm:grid-cols-2
          lg:grid-cols-3
          gap-6
          items-stretch
          justify-items-center
        "
            >
                <Card
                    title="Unlock Wallet"
                    description="Re-enter your password or keystore to access your funds."
                    ctaLabel="Unlock"
                    ctaAction={() => openDrawer('unlock')}
                    ctaVariant="accent"
                    ctaSize="md"
                    className="max-w-xs p-4"
                />

                <Card
                    title="Import Wallet"
                    description="Restore your wallet from a backup phrase or key."
                    ctaLabel="Import"
                    ctaAction={() => openDrawer('import')}
                    ctaVariant="danger"
                    ctaSize="md"
                    className="max-w-xs p-4"
                />

                <Card
                    title="Send ETH"
                    description="Transfer ETH to another address on the network."
                    ctaLabel="Send"
                    ctaAction={() => openDrawer('send')}
                    ctaVariant="primary"
                    ctaSize="md"
                    className="max-w-xs p-4"
                />
            </div>
        </main>
    )
}

