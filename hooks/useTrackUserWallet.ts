import { useConnection } from 'wagmi'
import { useEffect, useMemo, useRef, useState } from 'react'

type TrackingStatus = 'idle' | 'pending' | 'success' | 'error'

type TrackUserWalletResult = {
  status: TrackingStatus
  error: Error | null
}

type TrackWalletPayload = {
  address: string
  chain: { id: number | null; name: string | null }
  connector: { id: string | null; name: string | null; type: string | null }
  userAgent: string | null
  timestamp: string
}

export function useTrackUserWallet(): TrackUserWalletResult {
  const { address, chain, connector, isConnected } = useConnection()
  const [status, setStatus] = useState<TrackingStatus>('idle')
  const [error, setError] = useState<Error | null>(null)
  const lastTrackedSignatureRef = useRef('')

  const connectorType = useMemo(
    () => (connector as { type?: string } | undefined)?.type ?? null,
    [connector],
  )

  const basePayload = useMemo(() => {
    if (!isConnected || !address) return null
    return {
      address,
      chain: { id: chain?.id ?? null, name: chain?.name ?? null },
      connector: {
        id: connector?.id ?? null,
        name: connector?.name ?? null,
        type: connectorType,
      },
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    }
  }, [
    address,
    chain?.id,
    chain?.name,
    connector?.id,
    connector?.name,
    connectorType,
    isConnected,
  ])

  useEffect(() => {
    if (!basePayload) {
      setStatus('idle')
      setError(null)
      lastTrackedSignatureRef.current = ''
      return
    }

    const controller = new AbortController()
    const { signal } = controller

    const debounceTimer = setTimeout(() => {
      const payload: TrackWalletPayload = {
        ...basePayload,
        timestamp: new Date().toISOString(),
      }

      const signature = JSON.stringify({
        address: payload.address,
        chainId: payload.chain.id,
        connectorId: payload.connector.id,
      })

      if (lastTrackedSignatureRef.current === signature) return

      setStatus('pending')
      setError(null)

      void (async () => {
        try {
          const response = await fetch('/api/track-wallet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal,
          })

          if (!response.ok) {
            const errorBody = await response.json().catch(() => null)
            const message =
              errorBody?.error?.message ??
              `Track wallet failed with status ${response.status}`
            throw new Error(message)
          }

          lastTrackedSignatureRef.current = signature
          setStatus('success')
        } catch (err) {
          if (signal.aborted) return
          setError(err as Error)
          setStatus('error')
        }
      })()
    }, 250)

    return () => {
      clearTimeout(debounceTimer)
      controller.abort()
    }
  }, [basePayload])

  return { status, error }
}
