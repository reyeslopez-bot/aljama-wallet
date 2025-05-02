// components/WalletDrawer.tsx
'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useRef } from 'react';

interface WalletDrawerProps {
    open: boolean;
    onClose: () => void;
    mode: 'create' | 'unlock' | 'import';
    showOverlay?: boolean;
}

export default function WalletDrawer({ open, onClose, mode, showOverlay = true }: WalletDrawerProps) {
    const drawerRef = useRef<HTMLDivElement>(null);

    // Optional: Trap focus inside the drawer when it's open
    useEffect(() => {
        if (!open || !drawerRef.current) return;

        const firstFocusable = drawerRef.current.querySelector<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        firstFocusable?.focus();
    }, [open]);

    const modeDescription = {

        create: 'Create a brand new secure wallet.',
        unlock: 'Unlock your existing wallet securely.',
        import: 'Import a wallet using private key or seed phrase.',
    };

    return (
        <AnimatePresence>
            {open && (
                <>
                    {/* Overlay */}
                    {showOverlay && (
                        <motion.div
                            key="overlay"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={onClose}
                            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40"
                        />
                    )}

                    {/* Drawer Panel */}
                    <motion.div
                        key="drawer"
                        ref={drawerRef}
                        role="dialog"
                        aria-modal="true"
                        initial={{ x: '-100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '-100%' }}
                        transition={{ type: 'tween', duration: 0.3 }}
                        className="fixed top-0 left-0 h-full w-80 bg-white shadow-lg z-50 p-6 flex flex-col space-y-6"
                    >
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold text-yellow-700 capitalize">{mode} Wallet</h2>
                            <button
                                onClick={onClose}
                                className="text-gray-600 hover:text-gray-900 transition"
                                aria-label="Close wallet drawer"
                            >
                                ✕
                            </button>
                        </div>

                        <p className="text-sm text-gray-700">{modeDescription[mode]}</p>

                        {/* Future: You can drop in <CreateWalletForm />, etc. here */}
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}


