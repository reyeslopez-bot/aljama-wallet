// hooks/useTrackUserWallet.ts
import { useAccount } from 'wagmi'
import { useEffect } from 'react'

export function useTrackUserWallet() {
    const { address, isConnected } = useAccount()

    useEffect(() => {
        if (isConnected) {
            fetch('/api/track-wallet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ address }),
            })
        }
    }, [isConnected, address])
}
// maybe should add cnacnel or ignore
