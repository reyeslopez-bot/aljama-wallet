'use client';                           // ①
import {
    createContext, useContext,
    useState, ReactNode
} from 'react';  // ②
// ③ Define the four “modes” your drawer can be in.
export type PanelsMode = 'create' | 'unlock' | 'import' | 'send';

// ④ The shape of the data + actions your context will provide.
export interface PanelsContext {
    open: boolean;                                  // is the drawer visible?
    mode: PanelsMode;                               // which form to show?
    openPanels: (mode: PanelsMode) => void;         // action to open+set mode
    closePanels: () => void;       // action to close drawer
}

// ⑤ Create the actual Context object, allowing undefined before the provider wraps.
const WalletPanelsContext = createContext<PanelsContext | undefined>(undefined);

// ⑥ Provider component: holds the real state & actions.
export function WalletPanelsProvider({ children }: { children: ReactNode }) {
    const [open, setOpen] = useState(false);
    const [mode, setMode] = useState<PanelsMode>('create');

    function openPanels(m: PanelsMode) {
        setMode(m);
        setOpen(true);
    }
    function closePanels() {
        setOpen(false);
    }

    // ⑦ Value **must** include openDrawer & closeDrawer, exactly matching DrawerContext.
    return (
        <WalletPanelsContext.Provider value={{ open, mode, openPanels, closePanels }}>
            {children}
        </WalletPanelsContext.Provider>
    );
}

// ⑧ Custom hook: reads from the Context and throws if it’s missing.
export function useWalletPanels(): PanelsContext {
    const ctx = useContext(WalletPanelsContext);
    if (!ctx) {
        throw new Error('useWalletPanels must be inside WalletPanelsProvider');
    }
    return ctx;  // ← here’s where openDrawer is typed!
}

