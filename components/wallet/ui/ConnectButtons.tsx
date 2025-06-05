'use client';

import { useWalletConnectors } from '../hooks/useWalletConnectors';

export default function ConnectButtons() {
  const { connect, availableConnectors, isLoading, pendingConnector, error } = useWalletConnectors();

  return (
    <div className="flex flex-col space-y-2">
      {availableConnectors.map((connector) => (
        <button
          key={connector.id}
          onClick={() => connect({ connector })}
          className="p-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 transition"
        >
          {isLoading && pendingConnector?.id === connector.id
            ? 'Connecting...'
            : `Connect ${connector.name}`}
        </button>
      ))}
      {error && <div className="text-red-500 text-xs">{error.message}</div>}
    </div>
  );
}


