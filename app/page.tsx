'use client';

import React from 'react';
import { useTrackUserWallet } from '@/lib/hooks/useTrackUserWallet';
import { WalletPanels } from '@/components/wallet/panels/WalletPanels';
import FogParticleOverlay from '@/components/hero/FogParticleOverlay';
import HeroCard from '@/components/hero/HeroCard'; // ✅ Use your custom Hero section
import { TitleCalligraphy } from '@/components/hero/TitleCalligraphy';
import { FloatingSigils } from 'components/hero/FloatingSigils';
import WalletDetector from "@/components/wallet/ui/WalletDetector"

export default function HomePage() {
    // Fire off the wallet-tracking effect on mount
    useTrackUserWallet();

    return (
        <main className="min-h-screen flex flex-col items-center justify-center p-0 m-0">
            <FogParticleOverlay />
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

