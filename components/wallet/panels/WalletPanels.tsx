//WalletPanels.tsx
'use client';

import React, { useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';

import { useWalletPanels } from '../context/WalletPanelsContext';
import { MotionDiv } from './MotionPrimitives';
import { SlidePanel } from './SlidePanel';

import CreateWalletForm from '../forms/CreateWalletForm';
import ImportWalletForm from '../forms/ImportWalletForm';
import UnlockWalletForm from '../forms/UnlockWalletForm';
import SendTransactionForm from '../forms/SendTransactionForm';

export const WalletPanels: React.FC = () => {
    const { open, mode: panelMode, closePanels } = useWalletPanels();

    useEffect(() => {
        document.body.style.overflow = open ? 'hidden' : '';
        return () => {
            document.body.style.overflow = '';
        };
    }, [open]);

    return (
        <AnimatePresence>
            {open && (
                <MotionDiv
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="fixed inset-0 z-50 w-full h-screen bg-gradient-to-b from-[#141212] to-[#1c1a18] overflow-hidden"
                >
                    {/* Close Button */}
                    <button
                        onClick={closePanels}
                        className="z-50 absolute top-6 right-6 bg-yellow-400 hover:bg-yellow-500 text-black px-4 py-2 rounded-lg shadow-md font-semibold"
                    >
                        Close
                    </button>

                    {/* LEFT-SIDE PANELS */}
                    {(panelMode === 'create' || panelMode === 'import') && (
                        <SlidePanel direction="left">
                            {panelMode === 'create' && <CreateWalletForm />}
                            {panelMode === 'import' && <ImportWalletForm />}
                        </SlidePanel>
                    )}

                    {/* RIGHT-SIDE PANELS */}
                    {(panelMode === 'unlock' || panelMode === 'send') && (
                        <SlidePanel direction="right">
                            {panelMode === 'unlock' && <UnlockWalletForm />}
                            {panelMode === 'send' && <SendTransactionForm />}
                        </SlidePanel>

                    )}
                </MotionDiv>
            )}
        </AnimatePresence>
    );
};

