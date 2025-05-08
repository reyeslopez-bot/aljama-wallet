"use client";  // include this at the top if using Next.js App Router (ensures client-side execution)

import React, { createContext, useContext, useState, type ReactNode } from 'react';

/** Define the shape of the WalletDrawer context value (state and actions) */
interface WalletDrawerContextValue {
    isOpen: boolean;
    openDrawer: (mode: Mode) => void;   // ← takes a Mode now
    closeDrawer: () => void;
}

/** Create a Context for the WalletDrawer (initialized as undefined default) */
const WalletDrawerContext = createContext<WalletDrawerContextValue | undefined>(undefined);

/** Hook to use the WalletDrawer context */
export function useWalletDrawer(): WalletDrawerContextValue {
    const context = useContext(WalletDrawerContext);
    if (!context) {
        throw new Error("useWalletDrawer must be used within a <WalletDrawer> provider.");
    }
    return context;
}

/** WalletDrawer component (Context Provider and Drawer UI) */
function WalletDrawer({ children }: { children?: ReactNode }) {
    // State to control drawer visibility
    const [isOpen, setIsOpen] = useState(false);

    // Actions to open/close the drawer
    const openDrawer = () => setIsOpen(true);
    const closeDrawer = () => setIsOpen(false);

    return (
        <WalletDrawerContext.Provider value={{ isOpen, openDrawer, closeDrawer }}>
            {/* Render any children passed into the provider */}
            {children}

            {/* Drawer UI element (only rendered when open) */}
            {isOpen && (
                <div className="wallet-drawer">
                    {/* ... drawer content goes here ... */}
                    <button onClick={closeDrawer}>Close</button>
                </div>
            )}
        </WalletDrawerContext.Provider>
    );
}

export default WalletDrawer;


