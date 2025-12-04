// components/wallet/ui/XrplDevAccountCard.tsx
'use client'

import { useEffect, useState } from 'react'

type XrplState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; address: string; xrpBalance: string }

// safe helper for errors
function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  return 'Unknown XRPL error'
}

export function XrplDevAccountCard() {
  const [state, setState] = useState<XrplState>({ status: 'idle' })

  useEffect(() => {
    let cancelled = false

    async function load() {
      setState({ status: 'loading' })

      try {
        const res = await fetch('/api/xrpl/dev-account')
        const data: {
          ok: boolean
          account?: { address: string; xrpBalance: string }
          error?: string
        } = await res.json()

        if (!res.ok || !data.ok || !data.account) {
          throw new Error(data?.error ?? 'Failed to load XRPL dev account')
        }

        if (cancelled) return

        setState({
          status: 'ready',
          address: data.account.address,
          xrpBalance: data.account.xrpBalance,
        })
      } catch (error: unknown) {
        if (cancelled) return

        setState({
          status: 'error',
          message: getErrorMessage(error),
        })
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-4 space-y-2">
      <div className="text-sm font-semibold text-amber-200">
        XRPL Dev Account (Testnet)
      </div>

      {state.status === 'loading' && (
        <div className="text-xs text-amber-300">Loading XRPL dev account…</div>
      )}

      {state.status === 'error' && (
        <div className="text-xs text-red-400">XRPL error: {state.message}</div>
      )}

      {state.status === 'ready' && (
        <>
          <div className="text-xs text-amber-100 break-all">
            <span className="font-medium">Address:</span> {state.address}
          </div>
          <div className="text-xs text-amber-100">
            <span className="font-medium">Balance:</span> {state.xrpBalance} XRP
          </div>
        </>
      )}

      {state.status === 'idle' && (
        <div className="text-xs text-amber-300">Idle…</div>
      )}
    </div>
  )
}
