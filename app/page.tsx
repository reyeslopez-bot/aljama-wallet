// app/page.tsx
'use client'

import React from 'react'
import { useTrackUserWallet } from '@/components/wallet/hooks/useTrackUserWallet'
//import { useWalletDrawer } from '@/components/wallet/context/WalletDrawerContext'
//import Card from '@/components/ui/Card'
import HeroCard from '@/components/ui/HeroCard'
export default function HomePage() {
    // Fire off the wallet‐tracking effect on mount
    useTrackUserWallet()

    // Destructure the openDrawer function from context
    //const { openDrawer } = useWalletDrawer()

    return (
        <main className="min-h-screen flex flex-col items-center justify-center p-8">
            {/* Page heading */}
            <section className="w-full max-w-5xl text-center mb-12">
                <HeroCard
                    title="Welcome to Aljama Wallet"
                    subtitle="Secure. Simple. Sovereign."
                    className="z-50 hover:scale-105"
                    onClick={() => console.log('HeroCard clicked')}
                >
                    <h1 className="text-5xl font-bold"></h1>
                    <p className="mt-2 text-lg"></p>
                </HeroCard>

            </section>

            {/* Cards grid: 1 column on mobile, 2 on small screens, 2 on large */}
            {/*            <div
                className="
          w-full max-w-5xl
          grid grid-cols-1
          sm:grid-cols-2
          lg:grid-cols-2
          gap-6
          items-stretch
          justify-items-center
        "
            >
                <Card
                    title="Create Wallet"
                    description="Create a web3 Crypto wallet with Aljama"
                    ctaVariant="default"
                    ctaSize="md"
                    className="max-w-xs p-4"
                    ctaLabel="Create"
                    ctaAction={() => openDrawer('create')}
                />
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
            */}
        </main >
    )
}

