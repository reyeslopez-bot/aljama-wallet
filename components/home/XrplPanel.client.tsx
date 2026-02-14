'use client'

import { motion } from 'framer-motion'
import { useCallback, useEffect, useState } from 'react'
import { useComponentTelemetry } from '@/infra/telemetry/useComponentTelemetry'
import { useTranslations } from 'next-intl'
import { useSession } from 'next-auth/react'

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
  useComponentTelemetry('XrplPanel')
  const t = useTranslations('xrpl')
  const tAuth = useTranslations('auth')
  const { status: sessionStatus } = useSession()
  const locked = sessionStatus === 'unauthenticated'
  const [state, setState] = useState<XrplState>(initialState)

  const loadAccount = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }))
    try {
      const res = await fetch('/api/xrpl/dev-account')
      const body = (await res.json()) as
        | { ok: true; account: XrplAccount }
        | { ok: false; error: string }

      if (!res.ok || !body.ok) {
        throw new Error('XRPL dev account not available (check XRPL_DEV_SEED)')
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
    <section className="surface-panel panel-glow-lapis relative p-7 sm:p-8">
      <div className="absolute inset-x-8 top-5 ornament-line" />

      <header className="relative flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-saffron/70">{t('eyebrow')}</p>
          <h2 className="mt-3 font-display text-2xl font-semibold text-ivory sm:text-3xl">
            {t('title')}
          </h2>
          <p className="text-sm text-ivory/70">{t('body')}</p>
        </div>
        <span className="rounded-full bg-white/5 px-3 py-1 text-xs font-semibold tracking-wide text-ivory/70">
          {state.loading ? t('statusSyncing') : t('statusOnline')}
        </span>
      </header>

      <div className="relative mt-6 space-y-4">
        <div className="surface-inner p-4">
          {state.loading ? (
            <p className="text-sm text-ivory/60">{t('loading')}</p>
          ) : state.error ? (
            <p className="text-sm text-red-300">{state.error}</p>
          ) : state.account ? (
            <div className="space-y-3">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-jade/80">{t('accountTitle')}</p>
                <p className="mt-1 break-all font-mono text-sm text-jade">
                  {state.account.address}
                </p>
              </div>
              <div className="surface-soft px-4 py-3">
                <p className="text-xs uppercase tracking-[0.14em] text-ivory/60">{t('balanceLabel')}</p>
                <p className="mt-1 text-lg font-semibold text-ivory">
                  {state.account.xrpBalance} XRP
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-ivory/60">{t('empty')}</p>
          )}
        </div>

        <motion.button
          type="button"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          disabled={locked}
          onClick={() => void loadAccount()}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#6f96c9] via-[#5b86a8] to-[#4b9577] px-5 py-3 text-base font-semibold tracking-wide text-white shadow-lg shadow-[#4b9577]/30 transition focus:outline-none focus:ring-2 focus:ring-lapis/40 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {t('refresh')}
        </motion.button>

        {locked && (
          <p className="text-xs uppercase tracking-[0.18em] text-ivory/50">
            {tAuth('unlockActions')}
          </p>
        )}
      </div>
    </section>
  )
}
