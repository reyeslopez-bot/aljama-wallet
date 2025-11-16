// components/wallet/panels/WalletPanels.tsx
'use client'

import React, { useEffect } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useWalletPanels } from '../context/WalletPanelsContext'
import { MotionDiv } from './MotionPrimitives'
import { SlidePanel } from './SlidePanel'

import CreateWalletForm from '../forms/CreateWalletForm'
import ImportWalletForm from '../forms/ImportWalletForm'
import SendTransactionForm from '../forms/SendTransactionForm'
import ConnectWallet from '../ui/ConnectWallet'

export const WalletPanels: React.FC = () => {
  const { open, mode, closePanels } = useWalletPanels()

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  const renderPanelContent = () => {
    switch (mode) {
      case 'create':
        return <CreateWalletForm />
      case 'unlock':
        return <ConnectWallet />
      case 'import':
        return <ImportWalletForm />
      case 'send':
        return <SendTransactionForm />
      default:
        return null
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <MotionDiv
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 z-30"
          onClick={closePanels} // click backdrop = close
        >
          <SlidePanel direction="right" className="w-full max-w-md">
            <div
              onClick={(e: React.MouseEvent<HTMLDivElement>) =>
                e.stopPropagation()
              } // click panel = don’t close
            >
              {renderPanelContent()}
            </div>
          </SlidePanel>
        </MotionDiv>
      )}
    </AnimatePresence>
  )
}
