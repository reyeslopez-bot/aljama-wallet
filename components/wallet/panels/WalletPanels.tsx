// components/wallet/panels/WalletPanels.tsx
'use client';

import { useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';

import { useWalletPanels } from '../context/WalletPanelsContext';
import { MotionDiv } from './MotionPrimitives';
import { SlidePanel } from './SlidePanel';

import CreateWalletForm from '../forms/CreateWalletForm';
import ImportWalletForm from '../forms/ImportWalletForm';
import SendTransactionForm from '../forms/SendTransactionForm';
import ConnectWallet from '../ui/ConnectWallet';

export const WalletPanels: React.FC = () => {
  const { open, mode, closePanels } = useWalletPanels();

  // Disable body scrolling when a panel is open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  // Helper: render the correct panel content
  const renderPanelContent = () => {
    switch (mode) {
      case 'create':
        return <CreateWalletForm />;
      case 'unlock':
        return <ConnectWallet />;
      case 'import':
        return <ImportWalletForm />;
      case 'send':
        return <SendTransactionForm />;
      default:
        return null;
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <MotionDiv
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 z-30"
          onClick={closePanels}
        >
          <SlidePanel
            direction="right"
            className="w-full max-w-md"
            onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside the panel
          >
            {renderPanelContent()}
          </SlidePanel>
        </MotionDiv>
      )}
    </AnimatePresence>
  );
};

