'use client'

import { gsap } from 'gsap'
import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { useSession } from 'next-auth/react'
import { useAdaptiveExperience } from '@/hooks/useAdaptiveExperience'
import { useDynamicInfoStore } from '@/hooks/useDynamicInfoStore'
import { useStartFlowMotion } from '@/hooks/useStartFlowMotion'
import { useTranslations } from 'next-intl'
import { useXrplNetworkStore } from '@/infra/state/xrplNetworkStore'
import { XRPL_NETWORKS_BY_ID } from '@/lib/xrpl-networks'
import UnlockActionsLink from '@/components/ui/UnlockActionsLink.client'
import { getLocationConsent, onLocationConsentChange } from '@/infra/location/client'
import { getTelemetryConsent, onTelemetryConsentChange } from '@/infra/telemetry/client'
import { loadProfileImageForUsername } from '@/lib/storage/profileImage'
import { getHomeNow } from '@/components/home/homeClock'

function formatShortAddress(address: string) {
  const trimmed = address.trim()
  if (trimmed.length <= 12) return trimmed
  return `${trimmed.slice(0, 6)}…${trimmed.slice(-4)}`
}

function StatusDot({ tone }: { tone: 'ok' | 'warn' | 'bad' | 'idle' }) {
  const cls =
    tone === 'ok'
      ? 'bg-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.35)]'
      : tone === 'warn'
        ? 'bg-saffron shadow-[0_0_20px_rgba(210,167,98,0.3)]'
        : tone === 'bad'
          ? 'bg-red-400 shadow-[0_0_20px_rgba(248,113,113,0.25)]'
          : 'bg-white/25'

  return <span className={`h-2 w-2 rounded-full ${cls}`} />
}

function IconButton(props: {
  label: string
  onClick?: () => void
  href?: string
  isLight?: boolean
  children: ReactNode
}) {
  const className = props.isLight
    ? 'inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#7fa3c1]/45 bg-white/70 text-[#35506c] transition hover:bg-white hover:text-[#1d2f45] focus:outline-none focus:ring-2 focus:ring-[#5c8db4]/35'
    : 'inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-ivory/70 transition hover:bg-white/10 hover:text-ivory focus:outline-none focus:ring-2 focus:ring-saffron/30'

  if (props.href) {
    return (
      <a
        className={className}
        href={props.href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={props.label}
        title={props.label}
      >
        {props.children}
      </a>
    )
  }

  return (
    <button
      type="button"
      className={className}
      onClick={props.onClick}
      aria-label={props.label}
      title={props.label}
    >
      {props.children}
    </button>
  )
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        fill="currentColor"
        d="M18.9 2H22l-6.8 7.8L23.2 22H16.7l-5.1-6.5L5.8 22H2.7l7.3-8.3L1 2h6.7l4.6 6 6.6-6Zm-1.1 18h1.7L7.9 3.9H6.1L17.8 20Z"
      />
    </svg>
  )
}

function LinkedinIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        fill="currentColor"
        d="M20.4 20.4h-3.6v-5.7c0-1.4 0-3.2-2-3.2s-2.3 1.5-2.3 3.1v5.8H9V9h3.4v1.6h.1c.5-.9 1.7-1.9 3.5-1.9 3.7 0 4.4 2.4 4.4 5.6v6.1ZM4.9 7.4c-1.2 0-2.2-1-2.2-2.2S3.7 3 4.9 3s2.2 1 2.2 2.2-1 2.2-2.2 2.2ZM6.7 20.4H3.1V9h3.6v11.4Z"
      />
    </svg>
  )
}

function GithubIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2C6.5 2 2 6.6 2 12.2c0 4.5 2.9 8.3 6.9 9.6.5.1.7-.2.7-.5v-1.9c-2.8.6-3.4-1.4-3.4-1.4-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.6 1.1 1.6 1.1.9 1.6 2.4 1.1 3 .8.1-.7.4-1.1.7-1.3-2.2-.3-4.5-1.1-4.5-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.6 0 0 .8-.3 2.7 1 .8-.2 1.6-.3 2.4-.3s1.7.1 2.4.3c1.9-1.3 2.7-1 2.7-1 .5 1.3.2 2.3.1 2.6.6.7 1 1.6 1 2.7 0 3.9-2.3 4.7-4.5 5 .4.4.8 1.1.8 2.2v3.2c0 .3.2.6.7.5 4-1.3 6.9-5.1 6.9-9.6C22 6.6 17.5 2 12 2Z"
      />
    </svg>
  )
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 7a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2V7Zm2 0v11h9V7h-9ZM3 6a2 2 0 0 1 2-2h1v2H5v11h9v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z"
      />
    </svg>
  )
}

type CardCorner = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'
type StartFlowState = 'done' | 'active' | 'pending'

const INFO_CARD_CORNER_KEY = 'aljama.infoCard.corner'
const CARD_CORNERS: CardCorner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right']
const DUBAI_TIMEZONE = 'Asia/Dubai'
const DUBAI_UTC_LABEL = 'UTC+04:00'
const DRAG_IGNORE_SELECTOR = 'button, a, input, textarea, select, [role="button"]'
const HOVER_EXPAND_BLOCK_SELECTOR = '[data-dynamic-info-card-hover-block="true"]'
const HOVER_ENABLED_QUERY = '(hover: hover) and (pointer: fine)'

type DragState = {
  pointerId: number | null
  startX: number
  startY: number
  x: number
  y: number
}

function formatUtcOffsetForZone(date: Date, timeZone: string) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZoneName: 'shortOffset',
    }).formatToParts(date)
    const rawOffset = parts.find((part) => part.type === 'timeZoneName')?.value ?? 'GMT+0'
    const normalized = rawOffset.replace('GMT', 'UTC')
    const match = normalized.match(/^UTC([+-])(\d{1,2})(?::?(\d{2}))?$/)
    if (!match) return normalized
    const sign = match[1]
    const hour = match[2].padStart(2, '0')
    const minute = (match[3] ?? '00').padStart(2, '0')
    return `UTC${sign}${hour}:${minute}`
  } catch {
    return DUBAI_UTC_LABEL
  }
}

function isCardCorner(value: string | null): value is CardCorner {
  return Boolean(value && CARD_CORNERS.includes(value as CardCorner))
}

function getStartFlowTone(state: StartFlowState) {
  if (state === 'done') {
    return {
      body: 'text-emerald-100/72',
      line: 'via-emerald-300/45',
      node: 'border-emerald-300/45 bg-emerald-400/14 text-emerald-50',
      surface: 'border-emerald-300/14 bg-emerald-400/6',
      title: 'text-ivory/88',
    }
  }

  if (state === 'active') {
    return {
      body: 'text-saffron/82',
      line: 'via-saffron/55',
      node: 'border-saffron/50 bg-saffron/14 text-saffron shadow-[0_0_14px_rgba(240,215,160,0.18)]',
      surface: 'border-saffron/18 bg-saffron/6',
      title: 'text-ivory',
    }
  }

  return {
    body: 'text-ivory/55',
    line: 'via-white/20',
    node: 'border-white/12 bg-white/6 text-ivory/70',
    surface: 'border-white/8 bg-white/[0.03]',
    title: 'text-ivory/72',
  }
}

export default function DynamicInfoCard() {
  const t = useTranslations('infoCard')
  const tConsent = useTranslations('consent')
  const tActions = useTranslations('actions')
  const tCreate = useTranslations('createWallet')
  const { data: session, status: sessionStatus } = useSession()
  const showUnlockMessage = sessionStatus === 'unauthenticated'
  const [hovered, setHovered] = useState(false)
  const [detailsPinned, setDetailsPinned] = useState(false)
  const [now, setNow] = useState<Date | null>(null)
  const [networkTimezone, setNetworkTimezone] = useState(DUBAI_TIMEZONE)
  const [isLightTheme, setIsLightTheme] = useState(false)
  const [corner, setCorner] = useState<CardCorner>('top-right')
  const [isDragging, setIsDragging] = useState(false)
  const [hoverExpansionEnabled, setHoverExpansionEnabled] = useState(false)
  const [locationConsentState, setLocationConsentState] = useState<'granted' | 'denied' | 'unset'>('unset')
  const [telemetryConsentState, setTelemetryConsentState] = useState<'granted' | 'denied' | 'unset'>('unset')
  const { hasHydrated, shouldReduceMotion, shouldUseLightweightMode } = useAdaptiveExperience()
  const cardRef = useRef<HTMLElement | null>(null)
  const dragHandleRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const startFlowRef = useRef<HTMLDivElement | null>(null)
  const dragStateRef = useRef<DragState>({
    pointerId: null,
    startX: 0,
    startY: 0,
    x: 0,
    y: 0,
  })

  const user = useDynamicInfoStore((s) => s.user)
  const setUser = useDynamicInfoStore((s) => s.setUser)
  const wallet = useDynamicInfoStore((s) => s.wallet)
  const createStatus = useDynamicInfoStore((s) => s.createWalletStatus)
  const connectStatus = useDynamicInfoStore((s) => s.connectWalletStatus)
  const trackingStatus = useDynamicInfoStore((s) => s.trackingStatus)
  const lastEvent = useDynamicInfoStore((s) => s.lastEvent)
  const pushEvent = useDynamicInfoStore((s) => s.pushEvent)
  const selectedXrplNetworkId = useXrplNetworkStore((s) => s.selectedNetworkId)
  const availableStatusLabel = t('status.available')

  useEffect(() => {
    if (sessionStatus === 'loading') return
    if (sessionStatus === 'authenticated') {
      const email = session?.user?.email?.trim() ?? ''
      const displayName = session?.user?.name?.trim() || (email ? email.split('@')[0] : availableStatusLabel)
      const sessionImage = session?.user?.image?.trim() || null
      const fallbackImage = sessionImage ? null : loadProfileImageForUsername(displayName)
      setUser({
        name: displayName,
        role: email || availableStatusLabel,
        image: sessionImage ?? fallbackImage,
      })
      return
    }
    setUser(null)
  }, [availableStatusLabel, session?.user?.email, session?.user?.image, session?.user?.name, sessionStatus, setUser])

  useEffect(() => {
    setNow(getHomeNow())
    const intervalId = setInterval(() => setNow(getHomeNow()), 30_000)
    return () => clearInterval(intervalId)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return

    const mediaQuery = window.matchMedia(HOVER_ENABLED_QUERY)
    const syncHoverMode = () => {
      const nextEnabled = mediaQuery.matches && !(hasHydrated && shouldUseLightweightMode)
      setHoverExpansionEnabled(nextEnabled)
      if (!nextEnabled) setHovered(false)
    }

    syncHoverMode()

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', syncHoverMode)
      return () => mediaQuery.removeEventListener('change', syncHoverMode)
    }

    mediaQuery.addListener(syncHoverMode)
    return () => mediaQuery.removeListener(syncHoverMode)
  }, [hasHydrated, shouldUseLightweightMode])

  useEffect(() => {
    if (typeof document === 'undefined') return
    const syncTheme = () => setIsLightTheme(document.body.classList.contains('light'))
    syncTheme()
    const observer = new MutationObserver(syncTheme)
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
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
    const stored = window.localStorage.getItem(INFO_CARD_CORNER_KEY)
    if (isCardCorner(stored)) {
      setCorner(stored)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(INFO_CARD_CORNER_KEY, corner)
  }, [corner])

  useEffect(() => {
    const node = cardRef.current
    if (!node) return

    gsap.killTweensOf(node)
    gsap.set(node, { x: dragStateRef.current.x, y: dragStateRef.current.y, scale: 1 })

    return () => {
      gsap.killTweensOf(node)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const loadNetworkTimezone = async () => {
      if (getLocationConsent() !== 'granted') {
        if (!cancelled) {
          setNetworkTimezone(DUBAI_TIMEZONE)
        }
        return
      }

      try {
        const res = await fetch('/api/network-location', { method: 'GET', cache: 'no-store' })
        const body = (await res.json()) as {
          ok: boolean
          location?: { timezone?: string | null }
        }
        if (!res.ok || !body.ok) return
        const timezone = body.location?.timezone
        if (!cancelled && typeof timezone === 'string' && timezone.trim()) {
          setNetworkTimezone(timezone.trim())
        }
      } catch {
        // keep Dubai fallback on network lookup failures
      }
    }

    void loadNetworkTimezone()
    const unsubscribe = onLocationConsentChange(() => {
      void loadNetworkTimezone()
    })
    window.addEventListener('focus', loadNetworkTimezone)
    window.addEventListener('storage', loadNetworkTimezone)
    return () => {
      cancelled = true
      unsubscribe()
      window.removeEventListener('focus', loadNetworkTimezone)
      window.removeEventListener('storage', loadNetworkTimezone)
    }
  }, [])

  const timeLabel = useMemo(
    () => {
      if (!now) return '--:--'
      const zonedTime = new Intl.DateTimeFormat(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: networkTimezone,
      }).format(now)
      return `${zonedTime} ${formatUtcOffsetForZone(now, networkTimezone)}`
    },
    [networkTimezone, now],
  )

  const statusTone: 'ok' | 'warn' | 'bad' | 'idle' = useMemo(() => {
    if (createStatus === 'error' || connectStatus === 'error') return 'bad'
    if (createStatus === 'pending' || connectStatus === 'pending' || trackingStatus === 'pending') return 'warn'
    if (wallet.connectedAddress) return 'ok'
    return 'idle'
  }, [connectStatus, createStatus, trackingStatus, wallet.connectedAddress])

  const statusLabel = useMemo(() => {
    if (createStatus === 'pending') return t('status.creating')
    if (connectStatus === 'pending') return t('status.syncing')
    if (createStatus === 'error' || connectStatus === 'error') return t('status.action')
    if (wallet.connectedAddress) return t('status.available')
    if (wallet.createdAddress) return t('status.vault')
    return t('status.idle')
  }, [connectStatus, createStatus, wallet.connectedAddress, wallet.createdAddress])

  const primaryLine = useMemo(() => {
    if (wallet.connectedAddress) return formatShortAddress(wallet.connectedAddress)
    if (wallet.createdAddress) return formatShortAddress(wallet.createdAddress)
    return user?.name ?? 'Guest'
  }, [user?.name, wallet.connectedAddress, wallet.createdAddress])
  const avatarImage = user?.image?.trim() || null

  const secondaryLine = useMemo(() => {
    if (wallet.connectedAddress) {
      const parts = [wallet.chainName, wallet.connectorName].filter(Boolean)
      return parts.length ? parts.join(' · ') : 'Connected'
    }
    if (wallet.createdAddress) return 'Custody ready'
    return user?.role ?? 'New arrival'
  }, [user?.role, wallet.chainName, wallet.connectorName, wallet.connectedAddress, wallet.createdAddress])

  const copyText = wallet.connectedAddress ?? wallet.createdAddress
  const vaultSessionLabel = useMemo(() => {
    if (wallet.connectedAddress) return t('status.available')
    if (connectStatus === 'pending') return t('status.syncing')
    if (connectStatus === 'error') return t('status.action')
    if (wallet.createdAddress) return t('status.vault')
    return t('status.idle')
  }, [connectStatus, t, wallet.connectedAddress, wallet.createdAddress])

  const vaultNetworkLabel = wallet.chainName ?? (wallet.connectedAddress ? 'EVM' : '—')
  const vaultConnectorLabel =
    wallet.connectorName ?? (wallet.connectedAddress ? t('unknownConnector') : '—')

  const selectedXrplNetwork = XRPL_NETWORKS_BY_ID[selectedXrplNetworkId]
  const xrplBadgeTone = selectedXrplNetwork.isProduction
    ? 'bg-red-400'
    : selectedXrplNetwork.canResetWithoutWarning
      ? 'bg-amber-300'
      : 'bg-emerald-400'
  const detailsExpanded = detailsPinned || (hoverExpansionEnabled && hovered)
  const isGettingStarted = !wallet.connectedAddress && !wallet.createdAddress
  const permissionsConfigured = locationConsentState !== 'unset' && telemetryConsentState !== 'unset'
  const optionalServicesEnabled = locationConsentState === 'granted' && telemetryConsentState === 'granted'
  const permissionsSummary = permissionsConfigured
    ? optionalServicesEnabled
      ? tConsent('optionalToggleOn')
      : tConsent('optionalToggleOff')
    : t('gettingStarted.permissionsPending')
  const startFlowSteps = useMemo(
    () =>
      [
        {
          body: permissionsSummary,
          key: 'permissions',
          state: (permissionsConfigured ? 'done' : 'active') as StartFlowState,
          title: t('gettingStarted.steps.permissions.title'),
        },
        {
          body: t('gettingStarted.steps.wallet.body'),
          key: 'wallet',
          state: (permissionsConfigured ? 'active' : 'pending') as StartFlowState,
          title: t('gettingStarted.steps.wallet.title'),
        },
        {
          body: t('gettingStarted.steps.track.body'),
          key: 'track',
          state: 'pending' as StartFlowState,
          title: t('gettingStarted.steps.track.title'),
        },
      ] satisfies Array<{ body: string; key: string; state: StartFlowState; title: string }>,
    [permissionsConfigured, permissionsSummary, t],
  )

  useStartFlowMotion(startFlowRef, {
    enabled: detailsExpanded && isGettingStarted,
    shouldReduceMotion,
  })

  const cardCornerClass = useMemo(() => {
    if (corner === 'top-left') return 'left-4 top-20 sm:left-6 sm:top-24 lg:left-8 lg:top-24'
    if (corner === 'bottom-left') return 'bottom-4 left-4 sm:bottom-6 sm:left-6 lg:bottom-8 lg:left-8'
    if (corner === 'bottom-right') return 'bottom-4 right-4 sm:bottom-6 sm:right-6 lg:bottom-8 lg:right-8'
    return 'right-4 top-20 sm:right-6 sm:top-24 lg:right-8 lg:top-24'
  }, [corner])
  const cardViewportStyle = useMemo<CSSProperties>(
    () => ({
      width: 'clamp(260px, 24vw, 300px)',
      maxWidth: 'calc(100vw - 2rem)',
      maxHeight: corner.startsWith('top') ? 'calc(100vh - 6rem)' : 'calc(100vh - 2rem)',
    }),
    [corner],
  )

  const jumpToSection = useCallback((sectionId: 'create' | 'connect' | 'xrpl') => {
    if (typeof document === 'undefined') return
    const target = document.getElementById(sectionId)
    if (!target) return
    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const snapToNearestCorner = useCallback(() => {
    if (typeof window === 'undefined' || !cardRef.current) return
    const rect = cardRef.current.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    const horizontal = centerX < window.innerWidth / 2 ? 'left' : 'right'
    const vertical = centerY < window.innerHeight / 2 ? 'top' : 'bottom'
    const nextCorner = `${vertical}-${horizontal}` as CardCorner
    setCorner(nextCorner)
    return nextCorner
  }, [])

  useEffect(() => {
    const node = contentRef.current
    if (!node) return

    gsap.killTweensOf(node)

    if (shouldReduceMotion) {
      gsap.set(node, { autoAlpha: 1, y: 0 })
      return
    }

    gsap.fromTo(
      node,
      { autoAlpha: 0, y: 6 },
      { autoAlpha: 1, y: 0, duration: 0.18, ease: 'power2.out', overwrite: 'auto' },
    )
  }, [detailsExpanded, shouldReduceMotion])

  const finishDrag = useCallback(
    (pointerId: number) => {
      const node = cardRef.current
      if (!node) return

      const dragHandle = dragHandleRef.current
      if (dragHandle && typeof dragHandle.releasePointerCapture === 'function') {
        try {
          if (typeof dragHandle.hasPointerCapture === 'function' && dragHandle.hasPointerCapture(pointerId)) {
            dragHandle.releasePointerCapture(pointerId)
          }
        } catch {
          // ignore pointer capture release failures
        }
      }

      dragStateRef.current.pointerId = null
      setIsDragging(false)
      snapToNearestCorner()

      const resetTransform = () => {
        const activeNode = cardRef.current
        if (!activeNode) return

        gsap.killTweensOf(activeNode)

        if (shouldReduceMotion) {
          dragStateRef.current.x = 0
          dragStateRef.current.y = 0
          gsap.set(activeNode, { x: 0, y: 0, scale: 1 })
          return
        }

        gsap.to(activeNode, {
          x: 0,
          y: 0,
          scale: 1,
          duration: 0.28,
          ease: 'power3.out',
          overwrite: 'auto',
          onUpdate: () => {
            dragStateRef.current.x = Number(gsap.getProperty(activeNode, 'x')) || 0
            dragStateRef.current.y = Number(gsap.getProperty(activeNode, 'y')) || 0
          },
          onComplete: () => {
            dragStateRef.current.x = 0
            dragStateRef.current.y = 0
          },
        })
      }

      window.requestAnimationFrame(resetTransform)
    },
    [shouldReduceMotion, snapToNearestCorner],
  )

  const handleDragPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return
      if (!cardRef.current) return

      const target = event.target as HTMLElement | null
      if (target?.closest(DRAG_IGNORE_SELECTOR)) return

      const node = cardRef.current
      dragStateRef.current.pointerId = event.pointerId
      dragStateRef.current.startX = event.clientX - dragStateRef.current.x
      dragStateRef.current.startY = event.clientY - dragStateRef.current.y

      if (typeof event.currentTarget.setPointerCapture === 'function') {
        try {
          event.currentTarget.setPointerCapture(event.pointerId)
        } catch {
          // ignore pointer capture failures
        }
      }

      gsap.killTweensOf(node)
      if (shouldReduceMotion) {
        gsap.set(node, { scale: 1.01 })
      } else {
        gsap.to(node, { scale: 1.01, duration: 0.12, overwrite: 'auto' })
      }
      setIsDragging(true)
      event.preventDefault()
    },
    [shouldReduceMotion],
  )

  const handleDragPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragStateRef.current.pointerId !== event.pointerId || !cardRef.current) return

    const nextX = event.clientX - dragStateRef.current.startX
    const nextY = event.clientY - dragStateRef.current.startY
    dragStateRef.current.x = nextX
    dragStateRef.current.y = nextY
    gsap.set(cardRef.current, { x: nextX, y: nextY })
  }, [])

  const handleDragPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (dragStateRef.current.pointerId !== event.pointerId) return
      finishDrag(event.pointerId)
    },
    [finishDrag],
  )

  const handleDragPointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (dragStateRef.current.pointerId !== event.pointerId) return
      finishDrag(event.pointerId)
    },
    [finishDrag],
  )

  const shouldExpandFromHoverTarget = useCallback(
    (target: EventTarget | null) => {
      if (detailsPinned) return true
      return !(target instanceof Element && target.closest(HOVER_EXPAND_BLOCK_SELECTOR))
    },
    [detailsPinned],
  )

  const handleMouseEnter = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      if (!hoverExpansionEnabled) return
      setHovered(shouldExpandFromHoverTarget(event.target))
    },
    [hoverExpansionEnabled, shouldExpandFromHoverTarget],
  )

  const handleMouseMove = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      if (!hoverExpansionEnabled || detailsPinned) return
      setHovered(shouldExpandFromHoverTarget(event.target))
    },
    [detailsPinned, hoverExpansionEnabled, shouldExpandFromHoverTarget],
  )

  return (
    <aside
      ref={cardRef}
      data-testid="dynamic-info-card"
      aria-label="Dynamic info card"
      onMouseEnter={handleMouseEnter}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => {
        if (!hoverExpansionEnabled) return
        setHovered(false)
      }}
      style={cardViewportStyle}
      className={`fixed z-50 overflow-hidden rounded-[18px] ${cardCornerClass}`}
    >
      <div className="surface-panel panel-glow-saffron h-full max-h-full overflow-y-auto overscroll-contain rounded-[18px]">
        <div
          ref={dragHandleRef}
          data-testid="dynamic-info-card-handle"
          onPointerDown={handleDragPointerDown}
          onPointerMove={handleDragPointerMove}
          onPointerUp={handleDragPointerUp}
          onPointerCancel={handleDragPointerCancel}
          className={`touch-none rounded-t-[18px] border-b border-white/10 bg-white/5 p-3 ${
            isDragging ? 'cursor-grabbing' : 'cursor-grab'
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-gradient-to-br from-[#c7794a] via-[#e0bf7f] to-[#4b9577] p-[1px]">
                {avatarImage ? (
                  <Image
                    src={avatarImage}
                    alt={`${primaryLine} avatar`}
                    width={36}
                    height={36}
                    unoptimized
                    className="h-full w-full rounded-full border border-white/15 object-cover"
                  />
                ) : (
                  <div
                    className={`flex h-full w-full items-center justify-center rounded-full text-xs font-semibold ${
                      isLightTheme ? 'bg-white/85 text-[#1d2f45]/90' : 'bg-black/80 text-ivory/80'
                    }`}
                  >
                    {(primaryLine[0] ?? 'G').toUpperCase()}
                  </div>
                )}
              </div>

              <div className="min-w-0">
                <div className="truncate text-sm font-semibold tracking-tight text-ivory">{primaryLine}</div>
                <div className="truncate text-[0.6875rem] tracking-wide text-ivory/60">{secondaryLine}</div>
              </div>
            </div>

            <div className="flex shrink-0 flex-col items-end gap-1">
              <div
                suppressHydrationWarning
                className="text-[0.625rem] font-semibold tabular-nums tracking-tight text-ivory/85"
              >
                {timeLabel}
              </div>
              <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[0.6875rem] font-semibold tracking-wide text-ivory/80">
                <StatusDot tone={statusTone} />
                <span className="whitespace-nowrap">{statusLabel}</span>
              </div>
            </div>
          </div>

          {lastEvent ? (
            <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-[0.6875rem] text-ivory/70">
              <span className="font-semibold text-ivory/80">{t('signal')}:</span> {lastEvent.message}
            </div>
          ) : null}

          <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-[0.6875rem]">
            <span className="uppercase tracking-[0.16em] text-ivory/55">{t('xrplNetwork')}</span>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 font-semibold tracking-wide text-ivory/85">
              <span className={`h-1.5 w-1.5 rounded-full ${xrplBadgeTone}`} />
              <span
                className={`text-[0.6875rem] font-semibold tracking-wide ${
                  isLightTheme ? 'text-[#1d2f45]/90' : 'text-ivory/85'
                }`}
              >
                {selectedXrplNetwork.name}
              </span>
            </div>
          </div>
        </div>

        <div className="p-3">
          {detailsExpanded ? (
            <div
              key="expanded"
              ref={contentRef}
              data-testid="dynamic-info-card-expanded"
              className="space-y-3"
            >
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                  <div className="text-[0.6875rem] uppercase tracking-[0.18em] text-ivory/50">{t('vaultSession')}</div>
                  <div className="mt-2 grid gap-2 text-[0.6875rem] text-ivory/75">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-ivory/50">{t('wallet')}</span>
                      <span className="font-mono text-ivory/80">
                        {wallet.connectedAddress
                          ? formatShortAddress(wallet.connectedAddress)
                          : wallet.createdAddress
                            ? formatShortAddress(wallet.createdAddress)
                            : '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-ivory/50">{t('network')}</span>
                      <span className="truncate text-ivory/80">{vaultNetworkLabel}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-ivory/50">{t('connectionMethod')}</span>
                      <span className="truncate text-ivory/80">{vaultConnectorLabel}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-ivory/50">{t('sessionStatus')}</span>
                      <span className="text-ivory/80">{vaultSessionLabel}</span>
                    </div>
                  </div>
                </div>

                {isGettingStarted ? (
                  <div
                    ref={startFlowRef}
                    data-testid="dynamic-info-card-start-flow"
                    className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#07111d]/75 p-3"
                  >
                    <div
                      aria-hidden="true"
                      className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(240,215,160,0.14),rgba(7,17,29,0)_48%),linear-gradient(180deg,rgba(127,163,193,0.08),rgba(7,17,29,0))]"
                    />
                    <div className="relative">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[0.625rem] uppercase tracking-[0.18em] text-saffron/82">
                            {t('gettingStarted.eyebrow')}
                          </div>
                          <div className="mt-1 text-sm font-semibold tracking-tight text-ivory">
                            {t('gettingStarted.title')}
                          </div>
                          <p className="mt-1 text-[0.6875rem] leading-5 text-ivory/62">
                            {t('gettingStarted.hint')}
                          </p>
                        </div>
                        <div className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[0.5625rem] font-semibold uppercase tracking-[0.18em] text-ivory/62">
                          {t('gettingStarted.badge')}
                        </div>
                      </div>

                      <div className="mt-3 space-y-2">
                        {startFlowSteps.map((step, index) => {
                          const tone = getStartFlowTone(step.state)
                          const isLastStep = index === startFlowSteps.length - 1
                          return (
                            <div
                              key={step.key}
                              data-start-flow-step
                              className={`flex gap-3 rounded-xl border px-3 py-2.5 ${tone.surface}`}
                            >
                              <div className="flex w-6 shrink-0 flex-col items-center">
                                <span
                                  data-start-flow-node-active={step.state === 'active' ? 'true' : undefined}
                                  className={`grid h-6 w-6 place-items-center rounded-full border text-[0.625rem] font-semibold ${tone.node}`}
                                >
                                  {index + 1}
                                </span>
                                {!isLastStep ? (
                                  <span
                                    aria-hidden="true"
                                    data-start-flow-line
                                    className={`mt-1 h-5 w-px bg-gradient-to-b from-white/10 ${tone.line} to-transparent`}
                                  />
                                ) : null}
                              </div>
                              <div className="min-w-0">
                                <div className={`text-[0.625rem] uppercase tracking-[0.16em] ${tone.title}`}>
                                  {step.title}
                                </div>
                                <p className={`mt-1 text-[0.6875rem] leading-5 ${tone.body}`}>{step.body}</p>
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            jumpToSection('create')
                            pushEvent({ kind: 'info', message: tActions('createWallet') })
                          }}
                          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[0.625rem] uppercase tracking-[0.16em] transition ${
                            isLightTheme
                              ? 'border-[#7fa3c1]/45 bg-white/70 text-[#3a5673]/85 hover:bg-white'
                              : 'border-white/10 bg-white/5 text-ivory/70 hover:bg-white/10'
                          }`}
                        >
                          {tActions('createWallet')}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            jumpToSection('connect')
                            pushEvent({ kind: 'info', message: tActions('connectWallet') })
                          }}
                          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[0.625rem] uppercase tracking-[0.16em] transition ${
                            isLightTheme
                              ? 'border-[#7fa3c1]/45 bg-white/70 text-[#3a5673]/85 hover:bg-white'
                              : 'border-white/10 bg-white/5 text-ivory/70 hover:bg-white/10'
                          }`}
                        >
                          {tActions('connectWallet')}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <IconButton
                      label={tCreate('copyAddress')}
                      isLight={isLightTheme}
                      onClick={() => {
                        if (!copyText) return
                        void navigator.clipboard.writeText(copyText)
                        pushEvent({ kind: 'success', message: tCreate('copiedAddress') })
                      }}
                    >
                      <CopyIcon />
                    </IconButton>
                    <IconButton label="X" href="https://x.com" isLight={isLightTheme}>
                      <XIcon />
                    </IconButton>
                    <IconButton label="LinkedIn" href="https://linkedin.com" isLight={isLightTheme}>
                      <LinkedinIcon />
                    </IconButton>
                    <IconButton label="GitHub" href="https://github.com" isLight={isLightTheme}>
                      <GithubIcon />
                    </IconButton>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      jumpToSection('create')
                      pushEvent({ kind: 'info', message: tActions('createWallet') })
                    }}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[0.625rem] uppercase tracking-[0.16em] transition ${
                      isLightTheme
                        ? 'border-[#7fa3c1]/45 bg-white/70 text-[#3a5673]/85 hover:bg-white'
                        : 'border-white/10 bg-white/5 text-ivory/70 hover:bg-white/10'
                    }`}
                  >
                    {tActions('createWallet')}
                  </button>
                  <button
                    type="button"
                    data-dynamic-info-card-toggle-state="expanded"
                    data-testid="dynamic-info-card-collapse-button"
                    aria-expanded={detailsExpanded}
                    onClick={() => {
                      setDetailsPinned(false)
                      setHovered(false)
                    }}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[0.625rem] uppercase tracking-[0.16em] transition ${
                      isLightTheme
                        ? 'border-[#7fa3c1]/45 bg-white/70 text-[#3a5673]/85 hover:bg-white'
                        : 'border-white/10 bg-white/5 text-ivory/70 hover:bg-white/10'
                    }`}
                  >
                    {t('collapse')}
                  </button>
                </div>
                {showUnlockMessage ? (
                  <UnlockActionsLink
                    className="text-[0.625rem] uppercase tracking-[0.14em] text-ivory/45"
                  />
                ) : null}
            </div>
          ) : (
            <div
              key="collapsed"
              ref={contentRef}
              data-testid="dynamic-info-card-collapsed"
              className="flex items-center justify-between"
            >
                <div className="flex items-center gap-2">
                  <IconButton label="X" href="https://x.com" isLight={isLightTheme}>
                    <XIcon />
                  </IconButton>
                  <IconButton label="LinkedIn" href="https://linkedin.com" isLight={isLightTheme}>
                    <LinkedinIcon />
                  </IconButton>
                  <IconButton label="GitHub" href="https://github.com" isLight={isLightTheme}>
                    <GithubIcon />
                  </IconButton>
                </div>

                <div
                  aria-hidden="true"
                  className={`h-5 w-px ${
                    isLightTheme ? 'bg-gradient-to-b from-transparent via-[#7fa3c1]/45 to-transparent' : 'bg-gradient-to-b from-transparent via-white/25 to-transparent'
                  }`}
                />

                <button
                  type="button"
                  data-dynamic-info-card-hover-block="true"
                  data-dynamic-info-card-toggle-state="collapsed"
                  data-testid="dynamic-info-card-expand-button"
                  aria-expanded={detailsExpanded}
                  onClick={() => setDetailsPinned(true)}
                  className={`rounded-full border px-3 py-1 text-[0.6875rem] font-semibold tracking-wide transition ${
                    isLightTheme
                      ? 'border-[#7fa3c1]/45 bg-white/70 text-[#36516d]/85 hover:bg-white'
                      : 'border-white/10 bg-white/5 text-ivory/70 hover:bg-white/10'
                  }`}
                >
                  {t('expand')}
                </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
