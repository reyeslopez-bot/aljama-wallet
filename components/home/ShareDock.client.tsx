'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useGsapPressable } from '@/hooks/useGsapPressable'

type ShareItem = {
  id: 'x' | 'linkedin' | 'facebook' | 'whatsapp' | 'email' | 'copy'
  label: string
  tone: string
  tilt: number
  icon: ReactNode
}

function XIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

function LinkedinIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  )
}

function FacebookIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  )
}

function WhatsappIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.465 3.488" />
    </svg>
  )
}

function EmailIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-.904.732-1.636 1.636-1.636h.91L12 10.09l9.455-6.269h.909c.904 0 1.636.732 1.636 1.636z" />
    </svg>
  )
}

function CopyIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" />
    </svg>
  )
}

function getConfiguredOrigin() {
  const value =
    process.env.NEXT_PUBLIC_SITE_URL
    ?? process.env.NEXT_PUBLIC_APP_URL
    ?? process.env.NEXTAUTH_URL
    ?? 'https://aljama.app'

  const trimmed = value.trim()
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed
  return `https://${trimmed}`
}

function ShareActionLink(props: {
  item: ShareItem
  statusId: string
  ariaLabel: string
  href: string
  newTab?: boolean
}) {
  const interactions = useGsapPressable<HTMLAnchorElement>({
    base: { rotate: props.item.tilt },
    hover: { y: -3, rotate: 0, scale: 1.03 },
    press: { scale: 0.98 },
  })

  return (
    <a
      ref={interactions.ref}
      href={props.href}
      target={props.newTab ? '_blank' : undefined}
      rel={props.newTab ? 'noopener noreferrer' : undefined}
      onPointerEnter={interactions.onPointerEnter}
      onPointerLeave={interactions.onPointerLeave}
      onPointerDown={interactions.onPointerDown}
      onPointerUp={interactions.onPointerUp}
      onPointerCancel={interactions.onPointerCancel}
      onBlur={interactions.onBlur}
      aria-label={props.ariaLabel}
      aria-describedby={props.statusId}
      title={props.item.label}
      data-testid={`share-dock-link-${props.item.id}`}
      className={`relative flex h-14 w-14 items-center justify-center border border-saffron/35 bg-gradient-to-br ${props.item.tone} text-[#f0d7a0] shadow-lg shadow-black/30 backdrop-blur-[10px] transition hover:border-saffron/55`}
      style={{ borderRadius: 2 }}
    >
      {props.item.icon}
    </a>
  )
}

function ShareActionButton(props: {
  item: ShareItem
  statusId: string
  ariaLabel: string
  onClick: () => void | Promise<void>
}) {
  const interactions = useGsapPressable<HTMLButtonElement>({
    base: { rotate: props.item.tilt },
    hover: { y: -3, rotate: 0, scale: 1.03 },
    press: { scale: 0.98 },
  })

  return (
    <button
      ref={interactions.ref}
      key={props.item.id}
      type="button"
      onPointerEnter={interactions.onPointerEnter}
      onPointerLeave={interactions.onPointerLeave}
      onPointerDown={interactions.onPointerDown}
      onPointerUp={interactions.onPointerUp}
      onPointerCancel={interactions.onPointerCancel}
      onBlur={interactions.onBlur}
      aria-label={props.ariaLabel}
      aria-describedby={props.statusId}
      title={props.item.label}
      data-testid={`share-dock-link-${props.item.id}`}
      onClick={props.onClick}
      className={`relative flex h-14 w-14 items-center justify-center border border-saffron/35 bg-gradient-to-br ${props.item.tone} text-[#f0d7a0] shadow-lg shadow-black/30 backdrop-blur-[10px] transition hover:border-saffron/55`}
      style={{ borderRadius: 2 }}
    >
      {props.item.icon}
    </button>
  )
}

export default function ShareDock() {
  const t = useTranslations('share')
  const pathname = usePathname()
  const [origin, setOrigin] = useState(getConfiguredOrigin())
  const [copied, setCopied] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const headingId = 'share-dock-title'
  const bodyId = 'share-dock-body'
  const actionsId = 'share-dock-actions'
  const statusId = 'share-dock-status'

  useEffect(() => {
    if (typeof window === 'undefined') return
    setHydrated(true)
    setOrigin(window.location.origin)
  }, [])

  const shareUrl = useMemo(() => {
    const safePath = pathname || '/en'
    return new URL(safePath, origin || 'https://aljama.app').toString()
  }, [origin, pathname])

  const shareTitle = t('title')
  const canCopy = hydrated && typeof navigator !== 'undefined' && typeof navigator.clipboard?.writeText === 'function'

  const shareLinks = useMemo(
    () => ({
      x: `https://x.com/intent/tweet?text=${encodeURIComponent(shareTitle)}&url=${encodeURIComponent(shareUrl)}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
      whatsapp: `https://wa.me/?text=${encodeURIComponent(`${shareTitle} ${shareUrl}`)}`,
      email: `mailto:?subject=${encodeURIComponent(shareTitle)}&body=${encodeURIComponent(shareUrl)}`,
    }),
    [shareTitle, shareUrl],
  )

  const shareItems: ShareItem[] = [
    { id: 'x', label: t('x'), tone: 'from-[#1d232a]/95 to-[#14191f]/95', tilt: -0.35, icon: <XIcon /> },
    { id: 'linkedin', label: t('linkedin'), tone: 'from-[#222831]/95 to-[#171c22]/95', tilt: -0.99, icon: <LinkedinIcon /> },
    { id: 'facebook', label: t('facebook'), tone: 'from-[#1f262f]/95 to-[#151b22]/95', tilt: -0.35, icon: <FacebookIcon /> },
    { id: 'whatsapp', label: t('whatsapp'), tone: 'from-[#202730]/95 to-[#171d24]/95', tilt: 0, icon: <WhatsappIcon /> },
    { id: 'email', label: t('email'), tone: 'from-[#1f252d]/95 to-[#151b21]/95', tilt: -0.05, icon: <EmailIcon /> },
    { id: 'copy', label: copied ? t('copied') : t('copy'), tone: 'from-[#232931]/95 to-[#191f26]/95', tilt: 0.24, icon: <CopyIcon /> },
  ]

  return (
    <section
      id="share"
      aria-labelledby={headingId}
      aria-describedby={bodyId}
      className="scroll-mt-28"
    >
      <div className="surface-panel panel-glow-lapis relative mx-auto max-w-5xl overflow-hidden p-8 md:p-10">
        <div className="absolute inset-x-8 top-5 ornament-line" />
        <div className="absolute -right-8 -top-8 h-28 w-28 rounded-[2rem] border border-white/10 bg-white/5 opacity-50 rotate-12" />

        <div className="relative space-y-7">
          <div className="space-y-3 text-center">
            <p className="text-xs uppercase tracking-[0.22em] text-saffron/70">{t('eyebrow')}</p>
            <h2 id={headingId} className="sr-only">
              {t('title')}
            </h2>
            <p id={bodyId} className="mx-auto max-w-2xl text-sm text-ivory/70">
              {t('body')}
            </p>
          </div>

          <div
            id={actionsId}
            className="flex flex-wrap items-center justify-center gap-4"
            role="group"
            aria-label={t('title')}
          >
            {shareItems.map((item) => (
              item.id === 'copy' && canCopy ? (
                <ShareActionButton
                  key={item.id}
                  item={item}
                  statusId={statusId}
                  ariaLabel={copied ? `${t('copy')} copied` : t('copy')}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(shareUrl)
                      setCopied(true)
                      window.setTimeout(() => setCopied(false), 1800)
                    } catch {
                      setCopied(false)
                    }
                  }}
                />
              ) : (
                <ShareActionLink
                  key={item.id}
                  item={item}
                  statusId={statusId}
                  ariaLabel={item.id === 'copy' ? t('openLink') : item.label}
                  href={item.id === 'copy' ? shareUrl : shareLinks[item.id]}
                  newTab={item.id !== 'email'}
                />
              )
            ))}
          </div>
          <p id={statusId} className="sr-only" aria-live="polite">
            {copied ? t('copied') : ''}
          </p>
        </div>
      </div>
    </section>
  )
}
