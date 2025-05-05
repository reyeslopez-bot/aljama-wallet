'use client';

import React, { useState } from 'react';
import WalletDrawer from '@/components/WalletDrawer';
import Button from '@/components/Button';
import Card from '@/components/Card';
import './globals.css';
import { useTrackUserWallet } from '@/hooks/useTrackUserWallet';
import ConnectButton from '@/components/ConnectButton';
import Balance from '@/components/Balance';
import SendTransactionForm from '@/components/SendTransactionForm';
import CreateWalletForm from '@/components/wallet/CreateWalletForm';
import UnlockWalletForm from '@/components/wallet/UnlockWalletForm';
import ImportWalletForm from '@/components/wallet/ImportWalletForm';

export default function Home() {
    useTrackUserWallet();

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
                return <CreateWalletForm />;
            case 'unlock':
                return <UnlockWalletForm />;
            case 'import':
                return <ImportWalletForm />;
        }
    };

    return (
        <div className="min-h-screen text-gray-900 flex flex-col">
            <main className="flex-grow flex flex-col items-center justify-center p-8">
                <h1 className="text-4xl font-bold mb-8 font-oleo">Welcome to Aljama Wallet</h1>

                <ConnectButton />
                <Balance />
                <SendTransactionForm />
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

