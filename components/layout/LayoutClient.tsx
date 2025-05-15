'use client';

import React from 'react'; // ✅ ensures JSX works
import { ReactNode } from 'react';
import { WagmiConfig } from 'wagmi';
import { wagmiConfig } from '../../lib/wagmi'; // ✅ will work once paths are set up
import { WalletPanelsProvider } from '@/components/wallet/context/WalletPanelsContext';

export default function LayoutClient({ children }: { children: ReactNode }) {
    return (
        <WagmiConfig config={wagmiConfig}>
            <WalletPanelsProvider>
                {/* Background layer */}
                <div className="fixed inset-0 overflow-hidden z-0">
                    <div
                        className="
              absolute inset-0
              bg-[url('/backgrounds/dunes-night.png')]
              bg-repeat-x bg-center bg-cover
              animate-slide-dunes
            "

                    />
                    <div className="absolute inset-0 pointer-events-none" />
                </div>


                {/* App UI */}
                <main className="relative z-10 flex-1">
                    {children}
                </main>

                {/* Wallet Drawer */}
            </WalletPanelsProvider>
        </WagmiConfig>
    );
}

