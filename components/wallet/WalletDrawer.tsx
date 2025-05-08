// components/wallet/WalletDrawer.tsx
'use client';

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useWalletDrawer, DrawerContext, DrawerMode } from './WalletDrawerContext';
import CreateWalletForm from './CreateWalletForm';
import UnlockWalletForm from './UnlockWalletForm';
import ImportWalletForm from './ImportWalletForm';
import SendTransactionForm from './SendTransactionForm';

/**
 * A record mapping each mode to the corresponding form component.
 */
const formByMode: Record<DrawerMode, React.ReactNode> = {
    create: <CreateWalletForm />,
    unlock: <UnlockWalletForm />,
    import: <ImportWalletForm />,
    send: <SendTransactionForm />,
};

export default function WalletDrawer() {
    // Pull in the state & closeDrawer action from context
    const { open: isOpen, mode, closeDrawer } = useWalletDrawer();

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* backdrop */}
                    <motion.div
                        className="fixed inset-0 bg-black/50 z-40"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={closeDrawer}
                    />

                    {/* sliding panel */}
                    <motion.div
                        className="fixed top-0 right-0 h-full w-80 bg-white z-50 shadow-lg"
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'tween', duration: 0.3 }}
                    >
                        {formByMode[mode]}
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}

