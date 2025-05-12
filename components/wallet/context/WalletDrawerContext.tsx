'use client';                           // ①
import {
    createContext, useContext,
    useState, ReactNode
} from 'react';  // ②
// ③ Define the four “modes” your drawer can be in.
export type DrawerMode = 'create' | 'unlock' | 'import' | 'send';

// ④ The shape of the data + actions your context will provide.
export interface DrawerContext {
    open: boolean;                                  // is the drawer visible?
    mode: DrawerMode;                               // which form to show?
    openDrawer: (mode: DrawerMode) => void;         // action to open+set mode
    closeDrawer: () => void;                        // action to close drawer
}

// ⑤ Create the actual Context object, allowing undefined before the provider wraps.
const WalletDrawerContext = createContext<DrawerContext | undefined>(undefined);

// ⑥ Provider component: holds the real state & actions.
export function WalletDrawerProvider({ children }: { children: ReactNode }) {
    const [open, setOpen] = useState(false);
    const [mode, setMode] = useState<DrawerMode>('create');

    function openDrawer(m: DrawerMode) {
        setMode(m);
        setOpen(true);
    }
    function closeDrawer() {
        setOpen(false);
    }

    // ⑦ Value **must** include openDrawer & closeDrawer, exactly matching DrawerContext.
    return (
        <WalletDrawerContext.Provider value={{ open, mode, openDrawer, closeDrawer }}>
            {children}
        </WalletDrawerContext.Provider>
    );
}

// ⑧ Custom hook: reads from the Context and throws if it’s missing.
export function useWalletDrawer(): DrawerContext {
    const ctx = useContext(WalletDrawerContext);
    if (!ctx) {
        throw new Error('useWalletDrawer must be inside WalletDrawerProvider');
    }
    return ctx;  // ← here’s where openDrawer is typed!
}

