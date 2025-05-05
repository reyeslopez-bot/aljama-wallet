// components/wallet/WalletManager.tsx
'use client';

import { useState } from 'react';
import WalletDrawer from '@/components/WalletDrawer';
import CreateWalletForm from './CreateWalletForm';
import UnlockWalletForm from './UnlockWalletForm';
import ImportWalletForm from './ImportWalletForm';
import Button from '@/components/Button';

export default function WalletManager() {
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
        <>
            <div className="flex flex-col gap-4">
                <Button label="Create Wallet" color="yellow" action={() => openDrawer('create')} />
                <Button label="Unlock Wallet" color="green" action={() => openDrawer('unlock')} />
                <Button label="Import Wallet" color="blue" action={() => openDrawer('import')} />
            </div>
            <WalletDrawer isOpen={isDrawerOpen} onClose={closeDrawer}>
                {renderForm()}
            </WalletDrawer>
        </>
    );
}

