'use client'

import { useConnection, useConnect, useConnectors, useDisconnect } from 'wagmi'

export default function WalletButton() {
  const { address, isConnected } = useConnection()
  const connectors = useConnectors()
  const { mutate: connect, isPending } = useConnect()
  const { mutate: disconnect } = useDisconnect()

  const hasInjected =
    typeof window !== 'undefined' &&
    Boolean((window as Window & { ethereum?: unknown }).ethereum)

  const readyConnectors = connectors.filter(
    (item) =>
      item.id === 'injected'
        ? hasInjected && (item as { ready?: boolean }).ready !== false
        : (item as { ready?: boolean }).ready !== false,
  )
  const injectedConnector = readyConnectors.find((item) => item.id === 'injected')
  const walletConnectConnector = readyConnectors.find((item) => item.id === 'walletConnect')
  const connector = injectedConnector ?? walletConnectConnector ?? readyConnectors[0]
  const shortAddress =
    address && address.length > 10
      ? `${address.slice(0, 6)}…${address.slice(-4)}`
      : address

  return (
    <div className="flex items-center">
      <button
        type="button"
        disabled={!connector || isPending}
        onClick={() => {
          if (!connector) return
          if (isConnected) {
            disconnect()
            return
          }
          connect({ connector })
        }}
        className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold tracking-wide text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? 'Connecting…' : isConnected ? shortAddress ?? 'Connected' : 'Connect'}
      </button>
    </div>
  )
}
