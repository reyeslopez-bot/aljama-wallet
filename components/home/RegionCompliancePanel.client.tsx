// components/home/RegionCompliancePanel.client.tsx
'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useComponentTelemetry } from '@/infra/telemetry/useComponentTelemetry'
import { useLocale, useTranslations } from 'next-intl'
import {
  DETECTED_REGION_KEY,
  isRegionSelectionMode,
  isSupportedRegion,
  REGION_KEY,
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
  const locale = useLocale()
  const [region, setRegion] = useState<UiRegion>('us')
  const [detectedRegion, setDetectedRegion] = useState<UiRegion>('us')
  const [selectionMode, setSelectionMode] = useState<RegionSelectionMode>('auto')
  const [regionChooserOpen, setRegionChooserOpen] = useState(false)
  const selectionModeRef = useRef<RegionSelectionMode>('auto')
  const titleId = 'region-compliance-title'
  const bodyId = 'region-compliance-body'
  const selectHintId = 'region-select-detail'
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
  const activeRegion = regions.find((option) => option.value === region) ?? regions[0]
  const detectedRegionOption = regions.find((option) => option.value === detectedRegion) ?? regions[0]

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
      setRegionChooserOpen((current) => current || nextSelectionMode === 'manual')

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
        <div>
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-ivory/60">
              {t('label')}
            </p>
            <p className="mt-2 text-xs text-ivory/50">
              {selectionMode === 'auto' ? t('autoBody') : t('manualBody')}
            </p>
          </div>
        </div>
        <div
          data-testid="region-compliance-current-region"
          className="mt-3 rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3"
        >
          <p className="text-base font-semibold text-ivory">{activeRegion.label}</p>
          <p id={selectHintId} data-testid="region-compliance-region-detail" className="mt-2 text-xs text-ivory/50">
            {activeRegion.detail}
          </p>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          {selectionMode === 'auto' ? (
            <button
              data-testid="region-compliance-show-regions"
              type="button"
              onClick={() => setRegionChooserOpen((open) => !open)}
              className="text-[11px] font-semibold uppercase tracking-[0.12em] text-saffron/80 transition hover:text-ivory"
            >
              {regionChooserOpen ? t('hideOtherRegions') : t('seeMoreRegions')}
            </button>
          ) : (
            <button
              data-testid="region-compliance-reset-auto"
              type="button"
              onClick={() => {
                setSelectionMode('auto')
                selectionModeRef.current = 'auto'
                setRegion(detectedRegion)
                setRegionChooserOpen(false)
                if (typeof window !== 'undefined') {
                  window.localStorage.setItem(REGION_SELECTION_MODE_KEY, 'auto')
                  window.localStorage.setItem(REGION_KEY, detectedRegion)
                }
              }}
              className="text-[11px] font-semibold uppercase tracking-[0.12em] text-saffron/80 transition hover:text-ivory"
            >
              {t('useDetectedRegion')}
            </button>
          )}
          {selectionMode === 'manual' && detectedRegion !== region ? (
            <span className="text-[11px] text-ivory/45">
              {t('detectedRegion')}: {detectedRegionOption.label}
            </span>
          ) : null}
        </div>
        {regionChooserOpen ? (
          <div
            data-testid="region-compliance-region-options"
            className="mt-3 border-t border-white/10 pt-3"
          >
            <label htmlFor="region-select" className="text-xs uppercase tracking-[0.16em] text-ivory/60">
              {t('otherRegionsTitle')}
            </label>
            <p className="mt-2 text-xs text-ivory/50">{t('otherRegionsBody')}</p>
            <select
              id="region-select"
              data-testid="region-compliance-select"
              value={region}
              onChange={(event) => {
                const next = event.target.value
                if (!isSupportedRegion(next)) return

                const nextSelectionMode = next === detectedRegion ? 'auto' : 'manual'

                setRegion(nextSelectionMode === 'auto' ? detectedRegion : next)
                setSelectionMode(nextSelectionMode)
                setRegionChooserOpen(nextSelectionMode === 'manual')
                selectionModeRef.current = nextSelectionMode
                if (typeof window !== 'undefined') {
                  window.localStorage.setItem(REGION_SELECTION_MODE_KEY, nextSelectionMode)
                  window.localStorage.setItem(REGION_KEY, nextSelectionMode === 'auto' ? detectedRegion : next)
                }
              }}
              aria-describedby={selectHintId}
              className="mt-3 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-sm text-ivory focus:outline-none focus:ring-2 focus:ring-saffron/30"
            >
              {regions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      <div data-testid="region-compliance-list" className="surface-soft p-4 text-sm text-ivory/70">
        <p className="text-xs uppercase tracking-[0.16em] text-ivory/50">{t('complianceTitle')}</p>
        <div className="mt-2 space-y-1">
          {compliance.map((item) => (
            <div
              key={item.title}
              data-testid={`region-compliance-item-${item.value}`}
              className={`rounded-xl px-3 py-3 ${
                item.value === complianceTarget
                  ? 'bg-white/6'
                  : 'bg-transparent'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span
                    aria-hidden="true"
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      item.value === complianceTarget ? 'bg-saffron' : 'bg-white/20'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-ivory">{item.title}</p>
                      {item.value === complianceTarget ? (
                        <span className="text-[10px] uppercase tracking-[0.12em] text-saffron/80">
                          {t('primaryTarget')}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-ivory/50">{item.detail}</p>
                  </div>
                </div>
                <Link
                  data-testid={`region-compliance-link-${item.value}`}
                  href={`/${locale}/compliance?target=${item.value}`}
                  aria-label={`Open ${item.title} details`}
                  className="shrink-0 text-[11px] text-ivory/55 underline decoration-white/15 underline-offset-4 transition hover:text-ivory hover:decoration-ivory/40 focus:outline-none focus:ring-2 focus:ring-saffron/35"
                >
                  {t('targeted')}
                </Link>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-ivory/40">{t('disclaimer')}</p>
      </div>
    </section>
  )
}
