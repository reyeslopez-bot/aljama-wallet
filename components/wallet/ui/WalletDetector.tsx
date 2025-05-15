"use client"

import { useAccount } from "wagmi"

export default function WalletDetector() {
    const { address, isConnected } = useAccount()

    if (!isConnected) return null

    return (
        <div className="p-4 border rounded bg-black/50 text-white text-sm shadow-lg">
            <p>Connected:</p>
            <p className="font-mono break-all">{address}</p>
        </div>
    )
}

