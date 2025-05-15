'use client';

import React, { useEffect } from 'react';
import { useWalletPanels } from '../context/WalletPanelsContext';
import { MotionDiv } from './MotionPrimitives';
import { AnimatePresence } from 'framer-motion';

export const WalletPanels: React.FC = () => {
    const { open, mode, closePanels } = useWalletPanels();

    useEffect(() => {
        document.body.style.overflow = open ? 'hidden' : '';
    }, [open]);

    const walletData = [
        { token: 'ETH', balance: '1.254', value: '$3876.42' },
        { token: 'USDC', balance: '2034.10', value: '$2034.10' },
        { token: 'DAI', balance: '512.76', value: '$512.76' },
        { token: 'WBTC', balance: '0.093', value: '$5756.11' },
    ];

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
                    {/* Close button */}
                    <button
                        onClick={closePanels}
                        className="z-50 absolute top-6 right-6 bg-yellow-400 hover:bg-yellow-500 text-black px-4 py-2 rounded-lg shadow-md font-semibold"
                    >
                        Close
                    </button>

                    {/* Left Wallet Action Panel */}
                    <MotionDiv
                        initial={{ x: '-100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '-100%' }}
                        transition={{ type: 'spring', stiffness: 70, damping: 20 }}
                        className="absolute top-0 left-0 h-full w-full md:w-1/2 bg-[#2c1f1f]/80 text-white backdrop-blur-md shadow-xl z-40"
                    >
                        <div className="p-8 space-y-6">
                            <h2 className="text-2xl font-bold">
                                Wallet {mode.charAt(0).toUpperCase() + mode.slice(1)}
                            </h2>
                            <input
                                type="password"
                                placeholder="Enter your passphrase"
                                className="w-full px-4 py-2 rounded bg-gray-800 border border-yellow-500 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                            />
                            <button className="w-full bg-yellow-400 hover:bg-yellow-500 text-black py-2 rounded font-bold transition">
                                {mode === 'create'
                                    ? 'Create Wallet'
                                    : mode === 'unlock'
                                        ? 'Unlock Wallet'
                                        : 'Import Wallet'}
                            </button>
                        </div>
                    </MotionDiv>

                    {/* Right Wallet Metrics Panel */}
                    <MotionDiv
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', stiffness: 70, damping: 20 }}
                        className="absolute top-0 right-0 h-full w-full md:w-1/2 bg-[#1e2b28]/80 text-white backdrop-blur-lg shadow-xl z-40"
                    >
                        <div className="p-8 space-y-6">
                            <h2 className="text-2xl font-bold mb-4">Wallet Overview</h2>
                            <div className="space-y-3">
                                {walletData.map((item, idx) => (
                                    <div
                                        key={idx}
                                        className="flex justify-between bg-black/20 rounded px-4 py-2"
                                    >
                                        <span>{item.token}</span>
                                        <span>{item.balance}</span>
                                        <span>{item.value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </MotionDiv>
                </MotionDiv>
            )}
        </AnimatePresence>
    );
};

