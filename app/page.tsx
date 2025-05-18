'use client';

import React from 'react';
import { useTrackUserWallet } from '@/components/wallet/hooks/useTrackUserWallet';
import { WalletPanels } from '@/components/wallet/panels/WalletPanels';
import { FogParticlesOverlay } from '@/components/ui/ExtraEffects';
import HeroCard from '@/components/ui/HeroCard'; // ✅ Use your custom Hero section
import { FloatingSigils, TitleCalligraphy } from '@/components/ui/HeroExtras';
import WalletDetector from "@/components/wallet/ui/WalletDetector"

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
            <WalletPanels />
            <div className="absolute bottom-4 right-4 z-50 opacity-80">
                <WalletDetector />
            </div>
        </main>
    );
}

