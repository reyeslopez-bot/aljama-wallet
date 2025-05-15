'use client';

import React from 'react';
import { useTrackUserWallet } from '@/components/wallet/hooks/useTrackUserWallet';
import { WalletPanels } from '@/components/wallet/panels/WalletPanels';
import { FogParticlesOverlay } from '@/components/ui/ExtraEffects';
import HeroCard from '@/components/ui/HeroCard'; // ✅ Use your custom Hero section
import { FloatingSigils, TitleCalligraphy } from '@/components/ui/HeroExtras';

export default function HomePage() {
    // Fire off the wallet-tracking effect on mount
    useTrackUserWallet();

    return (
        <main className="min-h-screen flex flex-col items-center justify-center p-0 m-0">
            <FogParticlesOverlay />
            <FloatingSigils />
            <TitleCalligraphy />
            {/* Hero section with calligraphy, sigils, and CTA */}
            <HeroCard />

            {/* Wallet panels slide in from both sides */}
            <WalletPanels mode="unlock" />
        </main>
    );
}

