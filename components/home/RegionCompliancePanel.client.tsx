// components/home/RegionCompliancePanel.client.tsx
'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useComponentTelemetry } from '@/infra/telemetry/useComponentTelemetry'
import { useLocale, useTranslations } from 'next-intl'
import { useSession } from 'next-auth/react'
import UnlockActionsLink from '@/components/ui/UnlockActionsLink.client'
import {
  DETECTED_REGION_KEY,
  isRegionSelectionMode,
  isSupportedRegion,
  REGION_KEY,
  REGION_PROFILE_KEY,
  REGION_SELECTION_MODE_KEY,
  REGION_SYNC_EVENT,
  resolveComplianceTarget,
  type RegionSelectionMode,
  type UiRegion,
} from '@/lib/region-profile'

type RegionOption = {
  value: UiRegion
  label: string
  detail: string
}

type ComplianceOption = {
  value: 'gdpr' | 'soc2' | 'iso'
  title: string
  detail: string
}

export default function RegionCompliancePanel() {
  useComponentTelemetry('RegionCompliancePanel')
  const t = useTranslations('region')
  const tAuth = useTranslations('auth')
  const locale = useLocale()
  const { status: sessionStatus } = useSession()
  const saveProfileLocked = sessionStatus !== 'authenticated'
  const [region, setRegion] = useState<UiRegion>('us')
  const [detectedRegion, setDetectedRegion] = useState<UiRegion>('us')
  const [selectionMode, setSelectionMode] = useState<RegionSelectionMode>('auto')
  const [saved, setSaved] = useState(false)
  const selectionModeRef = useRef<RegionSelectionMode>('auto')
  const titleId = 'region-compliance-title'
  const bodyId = 'region-compliance-body'
  const selectHintId = 'region-select-detail'
  const signupStatusId = 'region-signup-status'
  const complianceTarget = resolveComplianceTarget(region)

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

    const syncFromStorage = () => {
      const storedDetected = window.localStorage.getItem(DETECTED_REGION_KEY)
      const storedRegion = window.localStorage.getItem(REGION_KEY)
      const storedSelectionMode = window.localStorage.getItem(REGION_SELECTION_MODE_KEY)
      const nextDetectedRegion = isSupportedRegion(storedDetected)
        ? storedDetected
        : isSupportedRegion(storedRegion)
          ? storedRegion
          : 'us'
      const nextSelectionMode = isRegionSelectionMode(storedSelectionMode) ? storedSelectionMode : 'auto'
      const nextRegion =
        nextSelectionMode === 'manual' && isSupportedRegion(storedRegion)
          ? storedRegion
          : nextDetectedRegion

      selectionModeRef.current = nextSelectionMode
      setDetectedRegion(nextDetectedRegion)
      setSelectionMode(nextSelectionMode)
      setRegion(nextRegion)

      if (window.localStorage.getItem(DETECTED_REGION_KEY) !== nextDetectedRegion) {
        window.localStorage.setItem(DETECTED_REGION_KEY, nextDetectedRegion)
      }
      if (window.localStorage.getItem(REGION_KEY) !== nextRegion) {
        window.localStorage.setItem(REGION_KEY, nextRegion)
      }
      if (window.localStorage.getItem(REGION_SELECTION_MODE_KEY) !== nextSelectionMode) {
        window.localStorage.setItem(REGION_SELECTION_MODE_KEY, nextSelectionMode)
      }
    }

    syncFromStorage()

    const handleRegionSync = (event: Event) => {
      const detailRegion = (event as CustomEvent<{ region?: string }>).detail?.region
      const nextDetectedRegion = typeof detailRegion === 'string' ? detailRegion : null

      if (!isSupportedRegion(nextDetectedRegion)) return

      window.localStorage.setItem(DETECTED_REGION_KEY, nextDetectedRegion)
      if (selectionModeRef.current !== 'manual') {
        window.localStorage.setItem(REGION_KEY, nextDetectedRegion)
      }

      syncFromStorage()
      setSaved(false)
    }

    const handleStorage = (event: StorageEvent) => {
      if (
        event.key !== REGION_KEY &&
        event.key !== DETECTED_REGION_KEY &&
        event.key !== REGION_SELECTION_MODE_KEY
      ) {
        return
      }

      syncFromStorage()
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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <label htmlFor="region-select" className="text-xs uppercase tracking-[0.16em] text-ivory/60">
              {t('label')}
            </label>
            <p className="mt-2 text-xs text-ivory/50">
              {selectionMode === 'auto' ? t('autoBody') : t('manualBody')}
            </p>
          </div>
          <span
            data-testid="region-compliance-mode-badge"
            className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-ivory/65"
          >
            {selectionMode === 'auto' ? t('autoMode') : t('manualMode')}
          </span>
        </div>
        <select
          id="region-select"
          data-testid="region-compliance-select"
          value={region}
          disabled={selectionMode === 'auto'}
          onChange={(event) => {
            const next = event.target.value
            if (!isSupportedRegion(next)) return

            setRegion(next)
            setSelectionMode('manual')
            selectionModeRef.current = 'manual'
            setSaved(false)
            if (typeof window !== 'undefined') {
              window.localStorage.setItem(REGION_SELECTION_MODE_KEY, 'manual')
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
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {selectionMode === 'auto' ? (
            <button
              data-testid="region-compliance-enable-manual"
              type="button"
              onClick={() => {
                setSelectionMode('manual')
                selectionModeRef.current = 'manual'
                setSaved(false)
                if (typeof window !== 'undefined') {
                  window.localStorage.setItem(REGION_SELECTION_MODE_KEY, 'manual')
                }
              }}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ivory/72 transition hover:border-saffron/35 hover:bg-saffron/10 hover:text-ivory"
            >
              {t('chooseRegion')}
            </button>
          ) : (
            <button
              data-testid="region-compliance-reset-auto"
              type="button"
              onClick={() => {
                setSelectionMode('auto')
                selectionModeRef.current = 'auto'
                setRegion(detectedRegion)
                setSaved(false)
                if (typeof window !== 'undefined') {
                  window.localStorage.setItem(REGION_SELECTION_MODE_KEY, 'auto')
                  window.localStorage.setItem(REGION_KEY, detectedRegion)
                }
              }}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ivory/72 transition hover:border-saffron/35 hover:bg-saffron/10 hover:text-ivory"
            >
              {t('useDetectedRegion')}
            </button>
          )}
          {selectionMode === 'manual' && detectedRegion !== region ? (
            <span className="text-[11px] text-ivory/45">
              {t('detectedRegion')}: {regions.find((option) => option.value === detectedRegion)?.label}
            </span>
          ) : null}
        </div>
      </div>

      <div data-testid="region-compliance-list" className="surface-soft p-4 text-sm text-ivory/70">
        <p className="text-xs uppercase tracking-[0.16em] text-ivory/50">{t('complianceTitle')}</p>
        <div className="mt-3 space-y-3">
          {compliance.map((item) => (
            <div
              key={item.title}
              data-testid={`region-compliance-item-${item.value}`}
              className={`rounded-2xl border p-3 ${
                item.value === complianceTarget
                  ? 'border-saffron/30 bg-saffron/10'
                  : 'border-white/8 bg-white/5'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-ivory">{item.title}</p>
                    <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-ivory/55">
                      {item.value === complianceTarget ? t('primaryTarget') : t('secondaryTarget')}
                    </span>
                  </div>
                  <p className="text-xs text-ivory/50">{item.detail}</p>
                </div>
                <Link
                  data-testid={`region-compliance-link-${item.value}`}
                  href={`/${locale}/compliance?target=${item.value}`}
                  aria-label={`Open ${item.title} details`}
                  className={`rounded-full border px-2.5 py-1 text-[11px] transition focus:outline-none focus:ring-2 focus:ring-saffron/35 ${
                    item.value === complianceTarget
                      ? 'border-saffron/35 bg-saffron/12 text-ivory hover:bg-saffron/18'
                      : 'border-white/10 bg-white/5 text-ivory/55 hover:border-white/20 hover:bg-white/10 hover:text-ivory/75'
                  }`}
                >
                  {t('targeted')}
                </Link>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-ivory/40">{t('disclaimer')}</p>
      </div>

      <div data-testid="region-compliance-signup" className="surface-inner p-4">
        <p className="text-xs uppercase tracking-[0.16em] text-ivory/60">{t('signupTitle')}</p>
        <p className="mt-2 text-sm text-ivory/70">{t('signupBody')}</p>
        <div className="mt-3">
          {saveProfileLocked ? (
            <UnlockActionsLink
              mode="signup"
              variant="button"
              label={tAuth('unlockActionsSignUpButton')}
              className="min-w-[12rem] bg-gradient-to-r from-[#f0d7a0] via-[#dda469] to-[#c7794a] text-[#20130b] shadow-lg shadow-[#c7794a]/30 hover:text-[#20130b] focus-visible:text-[#20130b]"
            />
          ) : (
            <button
              data-testid="region-compliance-save-profile"
              type="button"
              aria-describedby={saved ? signupStatusId : undefined}
              onClick={() => {
                if (typeof window !== 'undefined') {
                  window.localStorage.setItem(REGION_KEY, region)
                  window.localStorage.setItem(REGION_PROFILE_KEY, 'true')
                }
                setSaved(true)
              }}
              className="rounded-full bg-gradient-to-r from-[#f0d7a0] via-[#dda469] to-[#c7794a] px-4 py-2 text-sm font-semibold text-[#20130b] shadow-lg shadow-[#c7794a]/30 transition hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-saffron/35"
            >
              {t('signupButton')}
            </button>
          )}
        </div>
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
