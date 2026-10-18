import { useCallback, useEffect, useState } from 'react'
import { parseClientApiError } from '@/lib/security/client-api-error'
import type { MarketSnapshot } from '@/components/home/xrpl-market-chart'

export default function useMarketSnapshot() {
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refreshSnapshot = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/market-snapshot')
      const body = (await response.json().catch(() => null)) as
        | MarketSnapshot
        | { ok: false; error?: string; code?: string; details?: unknown }
        | null

      if (!response.ok || !body?.ok) {
        throw new Error(parseClientApiError(response, body).message)
      }

      setSnapshot(body)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Market snapshot unavailable')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshSnapshot()
  }, [refreshSnapshot])

  return { snapshot, loading, error, refreshSnapshot }
}
