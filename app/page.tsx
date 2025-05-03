'use client';

import { useState } from 'react';
import Card from '@/components/Card';
import Button from '@/components/Button';
import HeroCard from '@/components/HeroCard';
import WalletDrawer from '@/components/WalletDrawer';

function CreateWalletForm() {
    return (
        <form className="space-y-3">
            <input
                type="password"
                placeholder="New Password"
                className="w-full border p-2 rounded"
            />
            <input
                type="password"
                placeholder="Confirm Password"
                className="w-full border p-2 rounded"
            />
            <Button
                label="Create"
                color="yellow"
                size="lg"
                className="w-full"
                action={() => {
                    console.log('Creating wallet...');
                }}
            />
        </form>
    );
}

function UnlockWalletForm() {
    return (
        <form className="space-y-3">
            <input
                type="text"
                placeholder="Enter Private Key"
                className="w-full border p-2 rounded"
            />
            <Button
                label="Unlock"
                color="sunsetOrange"
                size="lg"
                className="w-full"
                action={() => {
                    console.log('Unlocking wallet...');
                }}
            />
        </form>
    );
}

function ImportWalletForm() {
    return (
        <form className="space-y-3">
            <textarea
                placeholder="Enter Seed Phrase"
                rows={4}
                className="w-full border p-2 rounded"
            />
            <Button
                label="Import"
                color="terracotta"
                size="lg"
                className="w-full"
                action={() => {
                    console.log('Importing wallet...');
                }}
            />
        </form>
    );
}

export default function Home() {
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [mode, setMode] = useState<'create' | 'unlock' | 'import'>('create');

    const openDrawer = (type: 'create' | 'unlock' | 'import') => {
        setMode(type);
        setDrawerOpen(true);
    };

    return (
        <div className="min-h-screen bg-[url('/backgrounds/dunes-background.png')] bg-cover bg-center bg-no-repeat bg-fixed text-gray-800">
            <WalletDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} mode={mode}>
                {mode === 'create' && <CreateWalletForm />}
                {mode === 'unlock' && <UnlockWalletForm />}
                {mode === 'import' && <ImportWalletForm />}
            </WalletDrawer>

            <main className="flex flex-col items-center p-8 transition-all duration-300 pb-20">
                <HeroCard
                    title="Welcome to Aljama Wallet"
                    subtitle="Forge your vault. Unlock your key. Manage your assets securely."
                    className="mb-12"
                />

                <div
                    className={`flex ${drawerOpen ? 'flex-col items-center ml-80' : 'flex-wrap justify-center'
                        } gap-8 w-full max-w-6xl transition-all duration-300 flex-col sm:flex-wrap`}
                >
                    <Card
                        title={<span className="font-oleo text-3xl">Create Wallet</span>}
                        description={<span className="text-md">Start your journey by creating a secure wallet.</span>}
                        className="bg-sand p-6"
                    >
                        <Button
                            label="Create Wallet"
                            color="sunsetOrange"
                            size="lg"
                            className="w-full"
                            action={() => openDrawer('create')}
                        />
                    </Card>

                    <Card
                        title={<span className="font-oleo text-3xl">Unlock Wallet</span>}
                        description={<span className="text-md">Access your wallet securely with your private key.</span>}
                        className="bg-sand p-6"
                    >
                        <Button
                            label="Unlock Wallet"
                            color="sunsetOrange"
                            size="lg"
                            className="w-full"
                            action={() => openDrawer('unlock')}
                        />
                    </Card>

                    <Card
                        title={<span className="font-oleo text-3xl">Import Wallet</span>}
                        description={<span className="text-md">Restore your wallet from a backup phrase or key.</span>}
                        className="bg-sand p-6"
                    >
                        <Button
                            label="Import Wallet"
                            color="sunsetOrange"
                            size="lg"
                            className="w-full"
                            action={() => openDrawer('import')}
                        />
                    </Card>
                </div>
            </main>
        </div>
    );
}

