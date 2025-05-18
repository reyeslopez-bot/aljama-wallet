'use client'

import React, { useEffect } from 'react'
import { useWalletPanels } from '../context/WalletPanelsContext'
import { MotionDiv } from './MotionPrimitives'
import { AnimatePresence } from 'framer-motion'

type WalletPanelsProps = {
    mode?: 'create' | 'unlock' | 'import'
}

export const WalletPanels: React.FC<WalletPanelsProps> = ({ mode }) => {
    const { open, mode: contextMode, closePanels } = useWalletPanels()

    // Determine actual mode: use prop if passed, otherwise use context
    const panelMode = mode ?? contextMode

    useEffect(() => {
        document.body.style.overflow = open ? 'hidden' : ''
        return () => {
            document.body.style.overflow = ''
        }
    }, [open])

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

                    {/* You can now use `panelMode` to control what to render inside */}
                    <div className="p-6 text-white">
                        <h2 className="text-2xl font-bold mb-2">Mode: {panelMode}</h2>
                        {/* Conditional content */}
                        {panelMode === 'create' && <p>Creating a new wallet...</p>}
                        {panelMode === 'unlock' && <p>Unlock your wallet</p>}
                        {panelMode === 'import' && <p>Import an existing wallet</p>}
                    </div>
                </MotionDiv>
            )}
        </AnimatePresence>
    )
}

