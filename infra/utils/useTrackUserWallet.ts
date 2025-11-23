// hooks/useTrackUserWallet.ts
import { useAccount } from 'wagmi'
import { useEffect, useRef, useState } from 'react'

type TrackingStatus = 'idle' | 'pending' | 'success' | 'error'

type TrackUserWalletResult = {
    status: TrackingStatus
    error: Error | null
}

export function useTrackUserWallet(): TrackUserWalletResult {
    const { address, isConnected } = useAccount()
    const [status, setStatus] = useState<TrackingStatus>('idle')
    const [error, setError] = useState<Error | null>(null)
    const lastTrackedAddressRef = useRef<string | undefined>(undefined)

    useEffect(() => {
        if (!isConnected) {
            setStatus('idle')
            setError(null)
            return
        }

        if (!address) {
            return
        }

        if (lastTrackedAddressRef.current === address) {
            return
        }

        const controller = new AbortController()
        const { signal } = controller

        setStatus('pending')
        setError(null)

        fetch('/api/track-wallet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address }),
            signal,
        })
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`Track wallet failed with status ${response.status}`)
                }

                lastTrackedAddressRef.current = address
                setStatus('success')
            })
            .catch((err: Error) => {
                if (signal.aborted) {
                    return
                }

                console.error('Failed to track wallet', err)
                setError(err)
                setStatus('error')
            })

        return () => {
            controller.abort()
        }
    }, [address, isConnected])

    return { status, error }
}
