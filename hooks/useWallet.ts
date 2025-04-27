// hooks/useWallet.ts

import { useState } from "react";

export function useWallet() {
    const [walletConnected, setWalletConnected] = useState(false);

    return {
        walletConnected,
        connectWallet: () => setWalletConnected(true),
        disconnectWallet: () => setWalletConnected(false),
    };
}
