// components/wallet/ui/ConnectButtons.tsx

'use client'

import React, { useState } from 'react'
import { useConnect } from 'wagmi'

export default function ConnectButtons() {
  const { connectors, connectAsync, error, status } = useConnect()
  const [pendingId, setPendingId] = useState<string | null>(null)

  const isPending = status === 'pending'

  const handleConnect = async (connector: any) => {
    const id = connector.id ?? connector.uid ?? connector.name
    setPendingId(id)
    try {
      await connectAsync({ connector })
    } finally {
      setPendingId(null)
    }
  }

  return (
    <div className="flex flex-col space-y-2">
      {connectors.map((connector: any) => {
        const id = connector.id ?? connector.uid ?? connector.name
        const isThisPending = pendingId === id

        return (
          <button
            key={id}
            onClick={() => handleConnect(connector)}
            disabled={!connector.ready || isPending}
            className="p-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 transition"
          >
            {isThisPending ? 'Connecting...' : `Connect ${connector.name}`}
          </button>
        )
      })}

      {error && <div className="text-red-500 text-xs">{error.message}</div>}
    </div>
  )
}
