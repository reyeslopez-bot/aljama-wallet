// components/home/RegionCompliancePanel.client.tsx
'use client'

import { useEffect, useState } from 'react'
import { useComponentTelemetry } from '@/infra/telemetry/useComponentTelemetry'
import { useTranslations } from 'next-intl'
import { useSession } from 'next-auth/react'

type RegionOption = {
  value: string
  label: string
  detail: string
}

const REGION_KEY = 'aljama.region'
const EMAIL_KEY = 'aljama.signupEmail'

export default function RegionCompliancePanel() {
  useComponentTelemetry('RegionCompliancePanel')
  const t = useTranslations('region')
  const tAuth = useTranslations('auth')
  const { status: sessionStatus } = useSession()
  const locked = sessionStatus !== 'authenticated'
  const [region, setRegion] = useState<string>('us')
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const regions: RegionOption[] = [
    { value: 'us', label: t('regions.us'), detail: t('regionDetail.us') },
    { value: 'eu', label: t('regions.eu'), detail: t('regionDetail.eu') },
    { value: 'mena', label: t('regions.mena'), detail: t('regionDetail.mena') },
    { value: 'apac', label: t('regions.apac'), detail: t('regionDetail.apac') },
    { value: 'latam', label: t('regions.latam'), detail: t('regionDetail.latam') },
  ]

  const compliance = [
    { title: t('compliance.gdpr'), detail: t('compliance.gdprDetail') },
    { title: t('compliance.soc2'), detail: t('compliance.soc2Detail') },
    { title: t('compliance.iso'), detail: t('compliance.isoDetail') },
  ]

  useEffect(() => {
    if (typeof window === 'undefined') return
    const storedRegion = window.localStorage.getItem(REGION_KEY)
    if (storedRegion) setRegion(storedRegion)
    const storedEmail = window.localStorage.getItem(EMAIL_KEY)
    if (storedEmail) setEmail(storedEmail)
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-saffron/70">{t('eyebrow')}</p>
        <h3 className="mt-3 font-display text-2xl font-semibold text-ivory">{t('title')}</h3>
        <p className="text-sm text-ivory/70">{t('body')}</p>
      </div>

      <div className="surface-inner p-4">
        <label htmlFor="region-select" className="text-xs uppercase tracking-[0.16em] text-ivory/60">
          {t('label')}
        </label>
        <select
          id="region-select"
          value={region}
          disabled={locked}
          onChange={(event) => {
            const next = event.target.value
            setRegion(next)
            if (typeof window !== 'undefined') {
              window.localStorage.setItem(REGION_KEY, next)
            }
          }}
          className="mt-3 w-full rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-sm text-ivory focus:outline-none focus:ring-2 focus:ring-saffron/30 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {regions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <p className="mt-2 text-xs text-ivory/50">
          {regions.find((option) => option.value === region)?.detail}
        </p>
      </div>

      <div className="surface-soft p-4 text-sm text-ivory/70">
        <p className="text-xs uppercase tracking-[0.16em] text-ivory/50">{t('complianceTitle')}</p>
        <div className="mt-3 space-y-3">
          {compliance.map((item) => (
            <div key={item.title} className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ivory">{item.title}</p>
                <p className="text-xs text-ivory/50">{item.detail}</p>
              </div>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-ivory/60">
                {t('targeted')}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-ivory/40">
          {t('disclaimer')}
        </p>
      </div>

      <div className="surface-inner p-4">
        <p className="text-xs uppercase tracking-[0.16em] text-ivory/60">{t('signupTitle')}</p>
        <p className="mt-2 text-sm text-ivory/70">{t('signupBody')}</p>
        <form
          className="mt-3 flex flex-col gap-3 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault()
            if (locked) return
            const trimmedEmail = email.trim()
            if (!trimmedEmail) {
              setError(t('emailError'))
              return
            }
            setError(null)
            setSubmitting(true)
            void fetch('/api/signup', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                email: trimmedEmail,
                region,
                source: 'region-panel',
              }),
            })
              .then(async (res) => {
                if (!res.ok) throw new Error('Signup failed')
                setSubmitted(true)
                if (typeof window !== 'undefined') {
                  window.localStorage.setItem(EMAIL_KEY, trimmedEmail)
                }
              })
              .catch(() => {
                setError(t('signupError'))
              })
              .finally(() => setSubmitting(false))
          }}
        >
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={t('emailPlaceholder')}
            disabled={locked}
            className="w-full rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-sm text-ivory placeholder:text-ivory/40 focus:outline-none focus:ring-2 focus:ring-saffron/30 disabled:cursor-not-allowed disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={locked || submitting}
            className="rounded-xl bg-gradient-to-r from-[#f0d7a0] via-[#dda469] to-[#c7794a] px-4 py-2 text-sm font-semibold text-[#1c120a] shadow-lg shadow-[#c7794a]/30 transition hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? t('signupSending') : t('signupButton')}
          </button>
        </form>
        {locked && (
          <p className="mt-2 text-xs uppercase tracking-[0.18em] text-ivory/50">
            {tAuth('unlockActions')}
          </p>
        )}
        {submitted && (
          <p className="mt-2 text-xs text-jade">
            {t('signupSuccess')}
          </p>
        )}
        {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
      </div>
    </div>
  )
}
