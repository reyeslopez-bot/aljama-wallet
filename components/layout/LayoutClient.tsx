// LayoutClient.tsx
'use client';

import { WagmiConfig } from 'wagmi';
import { wagmiConfig } from '@/lib/wagmi';
import { ReactNode } from 'react';
import { WalletDrawerProvider } from '@/components/wallet/context/WalletDrawerContext';
import WalletDrawer from '@/components/wallet/drawer/WalletDrawer';

export default function LayoutClient({ children }: { children: ReactNode }) {
    return (
        <WagmiConfig config={wagmiConfig}>
            <WalletDrawerProvider>

                {/* 1. Background layer */}
                <div className="fixed inset-0 overflow-hidden">
                    <div
                        className="
              absolute inset-0
              bg-[url('/images/dunes.jpg')] bg-repeat-x bg-center/cover
              animate-slide-dunes
            "
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-sand/80 via-transparent to-sand/80 pointer-events-none" />
                </div>

                {/* 2. Your app’s UI */}
                <main className="relative z-10 flex-1">
                    {children}
                </main>

                {/* 3. Wallet drawer */}
                <WalletDrawer />

            </WalletDrawerProvider>
        </WagmiConfig>
    );
}

