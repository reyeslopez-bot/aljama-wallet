// components/wallet/WalletDrawer.tsx
'use client';

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useWalletDrawer, DrawerMode } from '../context/WalletDrawerContext';
import CreateWalletForm from '../forms/CreateWalletForm';
import UnlockWalletForm from '../ui/UnlockWalletForm';
import ImportWalletForm from '../forms/ImportWalletForm';
import SendTransactionForm from '../forms/SendTransactionForm';

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
                        className="
                            fixed top-0 right-0 h-full w-100 
                            bg-sand 
                            z-50 shadow-lg
                        "
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'tween', duration: 0.5 }}
                    >
                        {formByMode[mode]}
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}

