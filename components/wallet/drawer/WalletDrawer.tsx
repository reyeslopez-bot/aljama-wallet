'use client'

import React from 'react'
import { AnimatePresence } from 'framer-motion'
import { useWalletDrawer, DrawerMode } from '../context/WalletDrawerContext'
import CreateWalletForm from '../forms/CreateWalletForm'
import UnlockWalletForm from '../forms/UnlockWalletForm'
import ImportWalletForm from '../forms/ImportWalletForm'
import SendTransactionForm from '../forms/SendTransactionForm'
import { MotionDiv } from './MotionPrimitives'

const formByMode: Record<DrawerMode, () => React.ReactElement> = {
    create: () => <CreateWalletForm />,
    unlock: () => <UnlockWalletForm />,
    import: () => <ImportWalletForm />,
    send: () => <SendTransactionForm />,
}

export default function WalletDrawer() {
    const { open: isOpen, mode, closeDrawer } = useWalletDrawer()

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <MotionDiv
                        className="fixed inset-0 bg-black/50 z-40"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={closeDrawer}
                    />

                    {/* Drawer panel */}
                    <MotionDiv
                        className="fixed top-0 right-0 h-full w-full max-w-md bg-sand z-50 shadow-lg p-6 overflow-y-auto"
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'tween', duration: 0.3 }}
                    >
                        {formByMode[mode]()}
                    </MotionDiv>
                </>
            )}
        </AnimatePresence>
    )
}

