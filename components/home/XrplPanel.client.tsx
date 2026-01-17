'use client'

import { motion } from 'framer-motion'
import { useCallback, useEffect, useState } from 'react'

type XrplAccount = {
  address: string
  xrpBalance: string
}

type XrplState = {
  loading: boolean
  error: string | null
  account: XrplAccount | null
}

const initialState: XrplState = {
  loading: true,
  error: null,
  account: null,
}

export function XrplPanel() {
  const [state, setState] = useState<XrplState>(initialState)

  const loadAccount = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }))
    try {
      const res = await fetch('/api/xrpl/dev-account')
      const body = (await res.json()) as
        | { ok: true; account: XrplAccount }
        | { ok: false; error: string }

      if (!res.ok || !body.ok) {
        throw new Error('XRPL dev account not available')
      }

      setState({ loading: false, error: null, account: body.account })
    } catch (error) {
      setState({
        loading: false,
        error: error instanceof Error ? error.message : 'XRPL error',
        account: null,
      })
    }
  }, [])

  useEffect(() => {
    void loadAccount()
  }, [loadAccount])

  return (
    <section className="group relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-white/10 via-white/5 to-black/60 p-6 shadow-2xl shadow-black/30 backdrop-blur-xl">
      <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      <div className="absolute -left-24 -top-24 h-48 w-48 rounded-full bg-[#7a5cff]/30 blur-[120px] transition-all duration-500 group-hover:scale-110" />
      <div className="absolute -right-16 bottom-0 h-40 w-40 rounded-full bg-pink-400/20 blur-[120px]" />

      <header className="relative flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-amber-100/70">
            XRPL + Ledger
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-[#f7f0e6] sm:text-3xl">
            XRP Ledger ready
          </h2>
          <p className="text-sm text-white/70">
            Live XRPL bridge via server-side RPC. Pull balances on demand.
          </p>
        </div>
        <span className="rounded-full bg-white/5 px-3 py-1 text-xs font-semibold tracking-wide text-white/70">
          {state.loading ? 'Syncing' : 'Online'}
        </span>
      </header>

      <div className="relative mt-6 space-y-4">
        <div className="rounded-2xl border border-white/10 bg-black/40 p-4 shadow-inner shadow-black/40">
          {state.loading ? (
            <p className="text-sm text-white/60">Fetching XRPL dev account…</p>
          ) : state.error ? (
            <p className="text-sm text-red-300">{state.error}</p>
          ) : state.account ? (
            <div className="space-y-3">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-emerald-100/80">
                  Dev account
                </p>
                <p className="mt-1 break-all font-mono text-sm text-emerald-100">
                  {state.account.address}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.14em] text-white/60">
                  Balance
                </p>
                <p className="mt-1 text-lg font-semibold text-white">
                  {state.account.xrpBalance} XRP
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-white/60">No XRPL data loaded.</p>
          )}
        </div>

        <motion.button
          type="button"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => void loadAccount()}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#7a5cff] to-[#c06cf2] px-5 py-3 text-base font-semibold tracking-wide text-white shadow-lg shadow-fuchsia-400/30 transition focus:outline-none focus:ring-2 focus:ring-fuchsia-200/40"
        >
          Refresh XRPL snapshot
        </motion.button>
      </div>
    </section>
  )
}
