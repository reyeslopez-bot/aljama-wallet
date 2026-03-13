'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useDynamicInfoStore } from '@/hooks/useDynamicInfoStore'
import { getLocationConsent, onLocationConsentChange } from '@/infra/location/client'
import { getTelemetryConsent, onTelemetryConsentChange } from '@/infra/telemetry/client'

export type StartFlowState = 'done' | 'active' | 'pending'
export type TrackedSection = 'create' | 'connect' | 'xrpl'
export type JourneyStepKey = 'permissions' | 'wallet' | 'track'

export type JourneyStep = {
  body: string
  key: JourneyStepKey
  state: StartFlowState
  title: string
}

export type JourneyAction = {
  key: TrackedSection
  label: string
  sectionId: TrackedSection
}

type ConsentState = 'granted' | 'denied' | 'unset'

const TRACKED_SECTION_IDS: TrackedSection[] = ['create', 'connect', 'xrpl']

export function useHomeJourneyProgress() {
  const t = useTranslations('infoCard')
  const tConsent = useTranslations('consent')
  const tActions = useTranslations('actions')
  const wallet = useDynamicInfoStore((state) => state.wallet)
  const createStatus = useDynamicInfoStore((state) => state.createWalletStatus)
  const connectStatus = useDynamicInfoStore((state) => state.connectWalletStatus)
  const trackingStatus = useDynamicInfoStore((state) => state.trackingStatus)
  const [locationConsentState, setLocationConsentState] = useState<ConsentState>('unset')
  const [telemetryConsentState, setTelemetryConsentState] = useState<ConsentState>('unset')
  const [seenSections, setSeenSections] = useState<Record<TrackedSection, boolean>>({
    create: false,
    connect: false,
    xrpl: false,
  })

  const markSectionSeen = useCallback((sectionId: TrackedSection) => {
    setSeenSections((current) => {
      if (current[sectionId]) return current
      return { ...current, [sectionId]: true }
    })
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const syncConsent = () => {
      setLocationConsentState(getLocationConsent())
      setTelemetryConsentState(getTelemetryConsent())
    }

    syncConsent()
    const unsubscribeLocation = onLocationConsentChange(syncConsent)
    const unsubscribeTelemetry = onTelemetryConsentChange(syncConsent)
    window.addEventListener('focus', syncConsent)
    window.addEventListener('storage', syncConsent)

    return () => {
      unsubscribeLocation()
      unsubscribeTelemetry()
      window.removeEventListener('focus', syncConsent)
      window.removeEventListener('storage', syncConsent)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const syncHash = () => {
      const hash = window.location.hash.replace('#', '')
      if (hash === 'create' || hash === 'connect' || hash === 'xrpl') {
        markSectionSeen(hash)
      }
    }

    syncHash()
    window.addEventListener('hashchange', syncHash)
    return () => window.removeEventListener('hashchange', syncHash)
  }, [markSectionSeen])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          const sectionId = entry.target.id
          if (sectionId === 'create' || sectionId === 'connect' || sectionId === 'xrpl') {
            markSectionSeen(sectionId)
          }
        })
      },
      {
        root: null,
        rootMargin: '-20% 0px -35% 0px',
        threshold: 0.35,
      },
    )

    const nodes = TRACKED_SECTION_IDS
      .map((sectionId) => document.getElementById(sectionId))
      .filter((node): node is HTMLElement => Boolean(node))

    nodes.forEach((node) => observer.observe(node))
    return () => observer.disconnect()
  }, [markSectionSeen])

  const permissionsConfigured =
    locationConsentState !== 'unset' && telemetryConsentState !== 'unset'
  const optionalServicesEnabled =
    locationConsentState === 'granted' && telemetryConsentState === 'granted'
  const walletReady = Boolean(wallet.connectedAddress || wallet.createdAddress)
  const walletFlowStarted =
    seenSections.create ||
    seenSections.connect ||
    createStatus !== 'idle' ||
    connectStatus !== 'idle' ||
    walletReady

  const permissionsStepState: StartFlowState = permissionsConfigured
    ? 'done'
    : walletFlowStarted || seenSections.xrpl
      ? 'pending'
      : 'active'
  const walletStepState: StartFlowState = walletReady
    ? 'done'
    : permissionsConfigured || walletFlowStarted
      ? 'active'
      : 'pending'
  const trackStepState: StartFlowState = seenSections.xrpl
    ? 'done'
    : walletReady || trackingStatus === 'pending'
      ? 'active'
      : 'pending'

  const permissionsSummary = permissionsConfigured
    ? optionalServicesEnabled
      ? tConsent('optionalToggleOn')
      : tConsent('optionalToggleOff')
    : t('gettingStarted.permissionsPending')
  const walletProgressSummary = useMemo(() => {
    if (walletReady) return t('gettingStarted.steps.wallet.ready')
    if (createStatus === 'pending') return t('gettingStarted.steps.wallet.creating')
    if (connectStatus === 'pending') return t('gettingStarted.steps.wallet.connecting')
    if (createStatus === 'error' || connectStatus === 'error') {
      return t('gettingStarted.steps.wallet.retry')
    }
    if (seenSections.create && !seenSections.connect) {
      return t('gettingStarted.steps.wallet.inCreate')
    }
    if (seenSections.connect && !seenSections.create) {
      return t('gettingStarted.steps.wallet.inConnect')
    }
    if (seenSections.create && seenSections.connect) {
      return t('gettingStarted.steps.wallet.inBoth')
    }
    return t('gettingStarted.steps.wallet.body')
  }, [
    connectStatus,
    createStatus,
    seenSections.connect,
    seenSections.create,
    t,
    walletReady,
  ])
  const trackProgressSummary = useMemo(() => {
    if (seenSections.xrpl) return t('gettingStarted.steps.track.done')
    if (walletReady) return t('gettingStarted.steps.track.active')
    if (walletFlowStarted) return t('gettingStarted.steps.track.waiting')
    return t('gettingStarted.steps.track.body')
  }, [seenSections.xrpl, t, walletFlowStarted, walletReady])

  const steps = useMemo(
    () =>
      [
        {
          body: permissionsSummary,
          key: 'permissions',
          state: permissionsStepState,
          title: t('gettingStarted.steps.permissions.title'),
        },
        {
          body: walletProgressSummary,
          key: 'wallet',
          state: walletStepState,
          title: t('gettingStarted.steps.wallet.title'),
        },
        {
          body: trackProgressSummary,
          key: 'track',
          state: trackStepState,
          title: t('gettingStarted.steps.track.title'),
        },
      ] satisfies JourneyStep[],
    [
      permissionsSummary,
      permissionsStepState,
      t,
      trackProgressSummary,
      trackStepState,
      walletProgressSummary,
      walletStepState,
    ],
  )

  const currentStepIndex = steps.findIndex((step) => step.state === 'active')
  const currentStep = currentStepIndex === -1 ? null : steps[currentStepIndex]
  const nextStep =
    currentStepIndex === -1
      ? null
      : steps.slice(currentStepIndex + 1).find((step) => step.state !== 'done') ?? null
  const completedSteps = steps.filter((step) => step.state === 'done')
  const showStartFlow = !(permissionsConfigured && walletReady && seenSections.xrpl)

  const actions = useMemo(() => {
    if (currentStep?.key === 'wallet') {
      return [
        { key: 'create', label: tActions('createWallet'), sectionId: 'create' },
        { key: 'connect', label: tActions('connectWallet'), sectionId: 'connect' },
      ] satisfies JourneyAction[]
    }

    if (currentStep?.key === 'track') {
      return [
        { key: 'xrpl', label: tActions('xrpl'), sectionId: 'xrpl' },
      ] satisfies JourneyAction[]
    }

    return [] satisfies JourneyAction[]
  }, [currentStep?.key, tActions])

  return {
    actions,
    completedSteps,
    currentStep,
    currentStepIndex,
    locationConsentState,
    markSectionSeen,
    nextStep,
    showStartFlow,
    steps,
  }
}
