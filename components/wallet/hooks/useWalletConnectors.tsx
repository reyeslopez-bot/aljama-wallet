'use client';

import { useConnect } from 'wagmi';
import { InjectedConnector } from 'wagmi/connectors/injected';
import { WalletConnectConnector } from 'wagmi/connectors/walletConnect';
import { CoinbaseWalletConnector } from 'wagmi/connectors/coinbaseWallet';

export function useWalletConnectors() {
  const { connect, isLoading, pendingConnector, error } = useConnect();

  const availableConnectors = [
    new InjectedConnector(),
    new WalletConnectConnector({
      options: { qrcode: true },
    }),
    new CoinbaseWalletConnector({
      options: { appName: 'Aljama Wallet' },
    }),
  ];

  return { connect, availableConnectors, isLoading, pendingConnector, error };
}

