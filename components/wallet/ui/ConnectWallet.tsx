'use client';

import { useAccount } from 'wagmi';
import ConnectButtons from './ConnectButtons';

export default function ConnectWallet() {
  const { address, isConnected } = useAccount();

  if (isConnected) {
    return (
      <div className="p-2 bg-green-500 text-white rounded">
        Connected: {address}
      </div>
    );
  }

  return <ConnectButtons />;
}

