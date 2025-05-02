'use client';

import Card from '@/components/Card';
import Button from '@/components/Button';
import HeroCard from '@/components/HeroCard';
import WalletDrawer from '@/components/WalletDrawer';
import { useState } from 'react';

export default function Home(): tsx.element {
    const [isDrawerOpen, setDrawerOpen] = useState(false);
    return (
        <div className="min-h-screen bg-[url('/backgrounds/dunes-background.png')] bg-cover bg-center bg-no-repeat bg-fixed text-gray-800">
            <WalletDrawer
                open={isDrawerOpen}
                onClose={() => setDrawerOpen(false)}
                mode="create"
                showOverlay={false} />
            <main className='flex flex-col min-h-screen items-center p-8'>
                <HeroCard
                    title="Welcome to Aljama Wallet"
                    subtitle="Forge your vault. Unlock your key. Manage your assets securely."
                    className="mb-12"
                />
                {/* Cards container */}
                <div className="flex flex-wrap justify-center gap-8 w-full max-w-6xl">
                    <Card
                        title={<span className="font-oleo text-3xl">Create Wallet</span>}
                        description={
                            <span className="text-md">
                                Start your journey by creating a secure wallet.
                            </span>
                        }
                        className="bg-sand"
                    >
                        <Button
                            label="Create Wallet"
                            color="sunsetOrange"
                            onClick={() => console.log('Create Wallet')}
                        />
                    </Card>

                    <Card
                        title={<span className="font-oleo text-3xl">Unlock Wallet</span>}
                        description={
                            <span className="text-md ">
                                Access your wallet securely with your private key.
                            </span>
                        }
                        className='bg-sunsetOrange'
                    >
                        <Button
                            label="Unlock Wallet"
                            color="terracotta"
                            onClick={() => console.log('Unlock Wallet')}
                        />
                    </Card>

                    <Card
                        title={<span className="font-oleo text-3xl">Manage Wallet</span>}
                        description={
                            <span className="text-md">
                                Check balance, send tokens, and track activity.
                            </span>
                        }
                        className='bg-terracotta'
                    >
                        <Button
                            label="Manage Wallet"
                            color="sand"
                            onClick={() => console.log('Manage Wallet')}
                        />
                    </Card>
                </div>
            </main >
        </div>
    );
}

