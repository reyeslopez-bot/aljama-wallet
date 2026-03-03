// components/home/RegionCompliancePanel.client.tsx
'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useComponentTelemetry } from '@/infra/telemetry/useComponentTelemetry'
import { useLocale, useTranslations } from 'next-intl'
import { useSession } from 'next-auth/react'
import UnlockActionsLink from '@/components/ui/UnlockActionsLink.client'

type RegionOption = {
  value: string
  label: string
  detail: string
}

type ComplianceOption = {
  value: 'gdpr' | 'soc2' | 'iso'
  title: string
  detail: string
}

const REGION_KEY = 'aljama.region'
const REGION_PROFILE_KEY = 'aljama.region.profileEnabled'
const REGION_SYNC_EVENT = 'aljama:region-sync'
const SUPPORTED_REGIONS = new Set(['us', 'eu', 'mena', 'apac', 'latam'])

function isSupportedRegion(value: string | null): value is string {
  return Boolean(value && SUPPORTED_REGIONS.has(value))
}

export default function RegionCompliancePanel() {
  useComponentTelemetry('RegionCompliancePanel')
  const t = useTranslations('region')
  const tAuth = useTranslations('auth')
  const locale = useLocale()
  const { status: sessionStatus } = useSession()
  const locked = sessionStatus !== 'authenticated'
  const showUnlockMessage = sessionStatus === 'unauthenticated'
  const [region, setRegion] = useState<string>('us')
  const [saved, setSaved] = useState(false)
  const titleId = 'region-compliance-title'
  const bodyId = 'region-compliance-body'
  const selectHintId = 'region-select-detail'
  const signupStatusId = 'region-signup-status'

  const regions: RegionOption[] = [
    { value: 'us', label: t('regions.us'), detail: t('regionDetail.us') },
    { value: 'eu', label: t('regions.eu'), detail: t('regionDetail.eu') },
    { value: 'mena', label: t('regions.mena'), detail: t('regionDetail.mena') },
    { value: 'apac', label: t('regions.apac'), detail: t('regionDetail.apac') },
    { value: 'latam', label: t('regions.latam'), detail: t('regionDetail.latam') },
  ]

  const compliance: ComplianceOption[] = [
    { value: 'gdpr', title: t('compliance.gdpr'), detail: t('compliance.gdprDetail') },
    { value: 'soc2', title: t('compliance.soc2'), detail: t('compliance.soc2Detail') },
    { value: 'iso', title: t('compliance.iso'), detail: t('compliance.isoDetail') },
  ]

  useEffect(() => {
    if (typeof window === 'undefined') return

    const storedRegion = window.localStorage.getItem(REGION_KEY)
    if (isSupportedRegion(storedRegion)) {
      setRegion(storedRegion)
    }

    const handleRegionSync = (event: Event) => {
      const detailRegion = (event as CustomEvent<{ region?: string }>).detail?.region
      const detailRegionValue = typeof detailRegion === 'string' ? detailRegion : null
      const nextRegion =
        isSupportedRegion(detailRegionValue)
          ? detailRegionValue
          : window.localStorage.getItem(REGION_KEY)

      if (!isSupportedRegion(nextRegion)) return
      setRegion(nextRegion)
      setSaved(false)
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== REGION_KEY) return
      if (!isSupportedRegion(event.newValue)) return
      setRegion(event.newValue)
      setSaved(false)
    }

    window.addEventListener(REGION_SYNC_EVENT, handleRegionSync as EventListener)
    window.addEventListener('storage', handleStorage)
    return () => {
      window.removeEventListener(REGION_SYNC_EVENT, handleRegionSync as EventListener)
      window.removeEventListener('storage', handleStorage)
    }
  }, [])

  return (
    <section
      data-testid="region-compliance-panel"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      className="space-y-6"
    >
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-saffron/70">{t('eyebrow')}</p>
        <h3 id={titleId} className="mt-3 font-display text-2xl font-semibold text-ivory">
          {t('title')}
        </h3>
        <p id={bodyId} className="text-sm text-ivory/70">
          {t('body')}
        </p>
      </div>

      <div data-testid="region-compliance-region-control" className="surface-inner p-4">
        <label htmlFor="region-select" className="text-xs uppercase tracking-[0.16em] text-ivory/60">
          {t('label')}
        </label>
        <select
          id="region-select"
          data-testid="region-compliance-select"
          value={region}
          disabled={locked}
          onChange={(event) => {
            const next = event.target.value
            setRegion(next)
            setSaved(false)
            if (typeof window !== 'undefined') {
              window.localStorage.setItem(REGION_KEY, next)
            }
          }}
          aria-describedby={selectHintId}
          className="mt-3 w-full rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-sm text-ivory focus:outline-none focus:ring-2 focus:ring-saffron/30 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {regions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <p id={selectHintId} data-testid="region-compliance-region-detail" className="mt-2 text-xs text-ivory/50">
          {regions.find((option) => option.value === region)?.detail}
        </p>
      </div>

      <div data-testid="region-compliance-list" className="surface-soft p-4 text-sm text-ivory/70">
        <p className="text-xs uppercase tracking-[0.16em] text-ivory/50">{t('complianceTitle')}</p>
        <div className="mt-3 space-y-3">
          {compliance.map((item) => (
            <div
              key={item.title}
              data-testid={`region-compliance-item-${item.value}`}
              className="flex items-start justify-between gap-3"
            >
              <div>
                <p className="text-sm font-semibold text-ivory">{item.title}</p>
                <p className="text-xs text-ivory/50">{item.detail}</p>
              </div>
              {locked ? (
                <span
                  title={tAuth('unlockActions')}
                  className="cursor-not-allowed rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-ivory/40 opacity-70"
                >
                  {t('targeted')}
                </span>
              ) : (
                <Link
                  data-testid={`region-compliance-link-${item.value}`}
                  href={`/${locale}/compliance?target=${item.value}`}
                  aria-label={`Open ${item.title} details`}
                  className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-ivory/60 transition hover:border-saffron/30 hover:bg-saffron/10 hover:text-ivory focus:outline-none focus:ring-2 focus:ring-saffron/35"
                >
                  {t('targeted')}
                </Link>
              )}
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-ivory/40">
          {t('disclaimer')}
        </p>
      </div>

      <div data-testid="region-compliance-signup" className="surface-inner p-4">
        <p className="text-xs uppercase tracking-[0.16em] text-ivory/60">{t('signupTitle')}</p>
        <p className="mt-2 text-sm text-ivory/70">{t('signupBody')}</p>
        <div className="mt-3">
          <button
            data-testid="region-compliance-save-profile"
            type="button"
            disabled={locked}
            aria-describedby={saved ? signupStatusId : undefined}
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.localStorage.setItem(REGION_KEY, region)
                window.localStorage.setItem(REGION_PROFILE_KEY, 'true')
              }
              setSaved(true)
            }}
            className="rounded-xl bg-gradient-to-r from-[#f0d7a0] via-[#dda469] to-[#c7794a] px-4 py-2 text-sm font-semibold text-[#1c120a] shadow-lg shadow-[#c7794a]/30 transition hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t('signupButton')}
          </button>
        </div>
        {showUnlockMessage && (
          <div data-testid="region-compliance-unlock" className="mt-4">
            <UnlockActionsLink
              className="block text-xs uppercase tracking-[0.18em] text-ivory/50"
            />
          </div>
        )}
        {saved && (
          <p
            id={signupStatusId}
            data-testid="region-compliance-save-status"
            role="status"
            aria-live="polite"
            className="mt-2 text-xs text-jade"
          >
            {t('signupSuccess')}
          </p>
        )}
      </div>
    </section>
  )
}
