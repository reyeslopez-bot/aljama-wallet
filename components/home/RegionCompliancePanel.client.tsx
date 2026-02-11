// components/home/RegionCompliancePanel.client.tsx
'use client'

import { useEffect, useState } from 'react'
import { useComponentTelemetry } from '@/infra/telemetry/useComponentTelemetry'

type RegionOption = {
  value: string
  label: string
  detail: string
}

const REGION_KEY = 'aljama.region'
const EMAIL_KEY = 'aljama.signupEmail'

const REGIONS: RegionOption[] = [
  { value: 'us', label: 'United States', detail: 'US data centers + disclosures' },
  { value: 'eu', label: 'European Union', detail: 'GDPR-first defaults' },
  { value: 'mena', label: 'MENA', detail: 'Regional UX + language focus' },
  { value: 'apac', label: 'APAC', detail: 'Low-latency regional routing' },
  { value: 'latam', label: 'LATAM', detail: 'Localized onboarding context' },
]

const COMPLIANCE = [
  { title: 'GDPR alignment', detail: 'Privacy-first consent controls' },
  { title: 'SOC 2 roadmap', detail: 'Operational controls targeting SOC 2' },
  { title: 'ISO 27001 roadmap', detail: 'Security management alignment' },
]

export default function RegionCompliancePanel() {
  useComponentTelemetry('RegionCompliancePanel')
  const [region, setRegion] = useState<string>('us')
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
        <p className="text-xs uppercase tracking-[0.2em] text-saffron/70">Region + Compliance</p>
        <h3 className="mt-3 font-display text-2xl font-semibold text-ivory">Set your operating region.</h3>
        <p className="text-sm text-ivory/70">
          Pick a region to tailor disclosure copy and privacy defaults. This is a UI preference only.
        </p>
      </div>

      <div className="surface-inner p-4">
        <label htmlFor="region-select" className="text-xs uppercase tracking-[0.16em] text-ivory/60">
          Region
        </label>
        <select
          id="region-select"
          value={region}
          onChange={(event) => {
            const next = event.target.value
            setRegion(next)
            if (typeof window !== 'undefined') {
              window.localStorage.setItem(REGION_KEY, next)
            }
          }}
          className="mt-3 w-full rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-sm text-ivory focus:outline-none focus:ring-2 focus:ring-saffron/30"
        >
          {REGIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <p className="mt-2 text-xs text-ivory/50">
          {REGIONS.find((option) => option.value === region)?.detail}
        </p>
      </div>

      <div className="surface-soft p-4 text-sm text-ivory/70">
        <p className="text-xs uppercase tracking-[0.16em] text-ivory/50">Compliance targets</p>
        <div className="mt-3 space-y-3">
          {COMPLIANCE.map((item) => (
            <div key={item.title} className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ivory">{item.title}</p>
                <p className="text-xs text-ivory/50">{item.detail}</p>
              </div>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-ivory/60">
                Targeted
              </span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-ivory/40">
          Informational only. Not a certification claim.
        </p>
      </div>

      <div className="surface-inner p-4">
        <p className="text-xs uppercase tracking-[0.16em] text-ivory/60">Sign up</p>
        <p className="mt-2 text-sm text-ivory/70">
          Get launch updates and security briefings.
        </p>
        <form
          className="mt-3 flex flex-col gap-3 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault()
            const trimmedEmail = email.trim()
            if (!trimmedEmail) {
              setError('Enter a valid email.')
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
                setError('Signup failed. Try again.')
              })
              .finally(() => setSubmitting(false))
          }}
        >
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@company.com"
            className="w-full rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-sm text-ivory placeholder:text-ivory/40 focus:outline-none focus:ring-2 focus:ring-saffron/30"
          />
          <button
            type="submit"
            disabled={submitting}
            className="rounded-xl bg-gradient-to-r from-[#f0d7a0] via-[#dda469] to-[#c7794a] px-4 py-2 text-sm font-semibold text-[#1c120a] shadow-lg shadow-[#c7794a]/30 transition hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Sending…' : 'Join updates'}
          </button>
        </form>
        {submitted && (
          <p className="mt-2 text-xs text-jade">
            Thanks — you’re on the list.
          </p>
        )}
        {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
      </div>
    </div>
  )
}
