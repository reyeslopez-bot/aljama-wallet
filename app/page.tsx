'use client';

import React, { useState } from 'react';
import WalletDrawer from '@/components/WalletDrawer';
import Button from '@/components/Button';
import Card from '@/components/Card';
import './globals.css';

export default function Home() {
    const [isDrawerOpen, setDrawerOpen] = useState(false);
    const [drawerMode, setDrawerMode] = useState<'create' | 'unlock' | 'import'>('create');

    const openDrawer = (mode: 'create' | 'unlock' | 'import') => {
        setDrawerMode(mode);
        setDrawerOpen(true);
    };

    const closeDrawer = () => {
        setDrawerOpen(false);
    };
    const renderForm = () => {
        switch (drawerMode) {
            case 'create':
                return (
                    <form className="space-y-3">
                        <input type="password" placeholder="New Password" className="w-full border p-2 rounded" />
                        <input type="password" placeholder="Confirm Password" className="w-full border p-2 rounded" />
                        <Button
                            label="Create"
                            color="yellow"
                            size="md"
                            className="w-full"
                            action={() => console.log('Creating wallet...')}
                        />
                    </form>
                );
            case 'unlock':
                return (
                    <form className="space-y-3">
                        <input type="text" placeholder="Enter Private Key" className="w-full border p-2 rounded" />
                        <Button
                            label="Unlock"
                            color="sunsetOrange"
                            size="md"
                            className="w-full"
                            action={() => console.log('Unlocking wallet...')}
                        />
                    </form>
                );
            case 'import':
                return (
                    <form className="space-y-3">
                        <textarea placeholder="Enter Seed Phrase" rows={4} className="w-full border p-2 rounded" />
                        <Button
                            label="Import"
                            color="terracotta"
                            size="md"
                            className="w-full"
                            action={() => console.log('Importing wallet...')}
                        />
                    </form>
                );
        }
    };

    return (
        <div className="min-h-screen bg-white text-gray-900 flex flex-col">
            <main className="flex-grow flex flex-col items-center justify-center p-8">
                <h1 className="text-4xl font-bold mb-8 font-oleo">Welcome to Aljama Wallet</h1>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card
                        title={<span className="font-oleo text-3xl">Create Wallet</span>}
                        description={<span className="text-md">Start fresh with a new wallet and secure password.</span>}
                        className="bg-yellow-100 p-6 max-w-sm w-full"
                    >
                        <Button
                            label="Create Wallet"
                            color="yellow"
                            size="md"
                            className="mx-auto"
                            action={() => openDrawer('create')}
                        />
                    </Card>

                    <Card
                        title={<span className="font-oleo text-3xl">Unlock Wallet</span>}
                        description={<span className="text-md">Access your existing wallet using your private key.</span>}
                        className="bg-orange-100 p-6 max-w-sm w-full"
                    >
                        <Button
                            label="Unlock Wallet"
                            color="sunsetOrange"
                            size="md"
                            className="mx-auto"
                            action={() => openDrawer('unlock')}
                        />
                    </Card>

                    <Card
                        title={<span className="font-oleo text-3xl">Import Wallet</span>}
                        description={<span className="text-md">Restore your wallet from a backup phrase or key.</span>}
                        className="bg-sand p-6 max-w-sm w-full"
                    >
                        <Button
                            label="Import Wallet"
                            color="terracotta"
                            size="md"
                            className="mx-auto"
                            action={() => openDrawer('import')}
                        />
                    </Card>
                </div>
            </main>

            {/* 🧠 THIS is where you use the drawer and render the form inside it */}
            <WalletDrawer
                open={isDrawerOpen}
                onCloseAction={() => closeDrawer()}
                mode={drawerMode}
            >
                {renderForm()}
            </WalletDrawer>
        </div>
    );
}

