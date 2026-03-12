// components/layout/Navbar.tsx
'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import WalletButton from '@/components/wallet/ui/WalletButton'
import { BRAND } from '@/constants/brand'
import { useLocale, useTranslations } from 'next-intl'
import { signOut, useSession } from 'next-auth/react'
import { hasRecognizedDevice, onTelemetryConsentChange } from '@/infra/telemetry/client'

const LANGUAGES = [
  { label: 'English', mobileLabel: 'EN', value: 'en' },
  { label: 'עברית', mobileLabel: 'עב', value: 'he' },
  { label: 'العربية', mobileLabel: 'عر', value: 'ar' },
]

type ThemeMode = 'light' | 'dark'
type MenuItemKey = 'overview' | 'create-connect' | 'xrpl' | 'trade-desk'

const THEME_KEY = 'aljama.theme'

export default function Navbar() {
  const t = useTranslations('navbar')
  const locale = useLocale()
  const pathname = usePathname()
  const router = useRouter()
  const { data: session, status } = useSession()
  const isAuthed = status === 'authenticated'
  const [menuOpen, setMenuOpen] = useState(false)
  const [languageOpen, setLanguageOpen] = useState(false)
  const [activeMenuKey, setActiveMenuKey] = useState<MenuItemKey | null>(null)
  const [theme, setTheme] = useState<ThemeMode>('dark')
  const [recognizedDevice, setRecognizedDevice] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const languageRef = useRef<HTMLDivElement>(null)

  const applyTheme = useCallback((nextTheme: ThemeMode) => {
    setTheme(nextTheme)
    if (typeof document !== 'undefined') {
      document.body.classList.remove('light', 'dark')
      document.body.classList.add(nextTheme)
      document.documentElement.style.colorScheme = nextTheme
    }
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(THEME_KEY, nextTheme)
    }
  }, [])

  const localePrefix = `/${locale}`
  const pathWithoutLocale = pathname.startsWith(localePrefix)
    ? pathname.slice(localePrefix.length) || '/'
    : pathname

  const walletRoutes =
    pathWithoutLocale.startsWith('/dashboard') ||
    pathWithoutLocale.startsWith('/wallet') ||
    pathWithoutLocale.startsWith('/swap') ||
    pathWithoutLocale.startsWith('/send')

  const showWallet = walletRoutes && isAuthed
  const isLight = theme === 'light'

  useEffect(() => {
    if (typeof window === 'undefined') return
    const storedTheme = window.localStorage.getItem(THEME_KEY)
    const nextTheme: ThemeMode = storedTheme === 'light' || storedTheme === 'dark' ? storedTheme : 'dark'
    applyTheme(nextTheme)
  }, [applyTheme])

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
      if (languageRef.current && !languageRef.current.contains(event.target as Node)) {
        setLanguageOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        setLanguageOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const syncRecognition = () => setRecognizedDevice(hasRecognizedDevice())
    syncRecognition()
    const unsubscribe = onTelemetryConsentChange(syncRecognition)
    window.addEventListener('storage', syncRecognition)
    window.addEventListener('focus', syncRecognition)
    return () => {
      unsubscribe()
      window.removeEventListener('storage', syncRecognition)
      window.removeEventListener('focus', syncRecognition)
    }
  }, [])

  const hashToMenuKey = useCallback((hash: string): MenuItemKey | null => {
    const normalized = hash.trim().toLowerCase()
    if (!normalized) return null
    if (normalized === '#overview') return 'overview'
    if (normalized === '#create' || normalized === '#connect') return 'create-connect'
    if (normalized === '#xrpl') return 'xrpl'
    if (normalized === '#trade-desk') return 'trade-desk'
    return null
  }, [])

  useEffect(() => {
    setMenuOpen(false)
    setLanguageOpen(false)
    if (typeof window === 'undefined') return
    if (pathWithoutLocale !== '/') {
      setActiveMenuKey(null)
      return
    }
    setActiveMenuKey(hashToMenuKey(window.location.hash) ?? 'overview')
  }, [hashToMenuKey, pathWithoutLocale, pathname])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (pathWithoutLocale !== '/') return

    const sections: Array<{ id: string; key: MenuItemKey }> = [
      { id: 'overview', key: 'overview' },
      { id: 'create', key: 'create-connect' },
      { id: 'connect', key: 'create-connect' },
      { id: 'xrpl', key: 'xrpl' },
      { id: 'trade-desk', key: 'trade-desk' },
    ]

    let frame: number | null = null
    const updateActive = () => {
      const hashKey = hashToMenuKey(window.location.hash)
      if (hashKey) {
        setActiveMenuKey(hashKey)
        return
      }

      const scrollY = window.scrollY
      const offset = 150
      let nextKey: MenuItemKey = 'overview'
      for (const section of sections) {
        const element = document.getElementById(section.id)
        if (!element) continue
        const top = element.getBoundingClientRect().top + window.scrollY
        if (scrollY + offset >= top) {
          nextKey = section.key
        }
      }
      setActiveMenuKey(nextKey)
    }

    const onScroll = () => {
      if (frame !== null) {
        window.cancelAnimationFrame(frame)
      }
      frame = window.requestAnimationFrame(updateActive)
    }

    updateActive()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    window.addEventListener('hashchange', onScroll)
    return () => {
      if (frame !== null) {
        window.cancelAnimationFrame(frame)
      }
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      window.removeEventListener('hashchange', onScroll)
    }
  }, [hashToMenuKey, pathWithoutLocale])

  const menuItems: Array<{ key: MenuItemKey; label: string; href: string }> = [
    { key: 'overview', label: t('overview'), href: `/${locale}#overview` },
    { key: 'create-connect', label: t('createConnect'), href: `/${locale}#create` },
    { key: 'xrpl', label: t('xrpl'), href: `/${locale}#xrpl` },
    { key: 'trade-desk', label: t('tradeDesk'), href: `/${locale}#trade-desk` },
  ]
  const authCtaLabel = recognizedDevice ? t('signIn') : t('signUp')
  const authCtaHref = recognizedDevice ? `/${locale}/login?mode=login` : `/${locale}/login?mode=register`
  const currentLanguage = LANGUAGES.find((lang) => lang.value === locale)
  const accountLabel =
    session?.user?.name?.trim() ||
    session?.user?.email?.split('@')[0] ||
    session?.user?.email ||
    'Account'

  return (
    <nav
      data-app-navbar="true"
      className="
        fixed top-0 left-0 right-0 z-50
        border-b
        backdrop-blur-xl
      "
      style={{
        color: isLight ? '#1d2a3b' : 'rgb(var(--ivory) / 0.9)',
        backgroundImage: isLight
          ? 'linear-gradient(to bottom, rgb(247 251 255 / 0.95), rgb(237 244 251 / 0.92), rgb(231 239 248 / 0.85))'
          : 'linear-gradient(to bottom, rgb(0 0 0 / 0.95), rgb(var(--onyx) / 0.9), rgb(0 0 0 / 0.7))',
        borderColor: isLight ? 'rgb(127 163 193 / 0.35)' : 'rgb(var(--saffron) / 0.2)',
        boxShadow: isLight
          ? '0 18px 40px rgba(116,145,170,0.25)'
          : '0 18px 50px rgba(0,0,0,0.45)',
      }}
    >
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-2 px-3 py-3 sm:gap-4 sm:px-4 md:px-6">
        <Link
          href={`/${locale}`}
          className="shrink-0 font-display text-lg font-black uppercase tracking-[0.14em] transition sm:text-xl md:text-2xl"
          style={{
            color: isLight ? '#b06f2f' : '#e8bf78',
            textShadow: isLight
              ? '0 1px 0 rgba(255,241,214,0.5), 0 6px 14px rgba(176,111,47,0.28)'
              : '0 1px 0 rgba(255,244,222,0.45), 0 0 18px rgba(232,191,120,0.42)',
          }}
        >
          {BRAND.name}
        </Link>

        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <div className="hidden items-center md:flex">
            {menuItems.map((item, itemIndex) => (
              <div
                key={`desktop-menu-item-${item.key}`}
                className={`flex items-center gap-1 ${
                  itemIndex === 0
                    ? ''
                    : isLight
                      ? 'ml-2 border-l border-[#7fa3c1]/35 pl-2'
                      : 'ml-2 border-l border-white/12 pl-2'
                }`}
              >
                <Link
                  href={item.href}
                  className={`rounded-full px-4 py-2 text-sm font-medium tracking-wide transition ${
                    item.key === activeMenuKey
                      ? isLight
                        ? 'border border-[#7fa3c1]/45 bg-[#7fb0d9]/30 text-[#1e3248]'
                        : 'bg-saffron/20 text-ivory'
                      : isLight
                        ? 'text-[#2f4863]/80 hover:bg-[#7fa3c1]/20 hover:text-[#1d2f45]'
                        : 'text-ivory/80 hover:bg-white/10 hover:text-ivory'
                  }`}
                >
                  {item.label}
                </Link>
              </div>
            ))}
          </div>

          <div className="relative md:hidden" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-medium transition sm:gap-2 sm:px-4 sm:text-sm ${
                isLight
                  ? 'border-[#7fa3c1]/45 bg-white/65 text-[#1f3348] hover:border-[#5c8db4]/60 hover:bg-white/85'
                  : 'border-white/15 bg-white/5 text-ivory hover:border-saffron/40 hover:bg-white/10'
              }`}
              aria-haspopup="true"
              aria-expanded={menuOpen}
              aria-controls="navbar-menu"
            >
              {t('menu')}
              <span className="text-xs opacity-80">{menuOpen ? '▲' : '▼'}</span>
            </button>

            {menuOpen && (
              <div
                id="navbar-menu"
                className={`absolute right-0 mt-2 w-48 rounded-2xl border p-2 shadow-xl ${
                  isLight
                    ? 'border-[#7fa3c1]/40 bg-gradient-to-b from-[#f9fcff]/95 via-[#eff5fb]/95 to-[#e7eef7]/92 shadow-[#7fa3c1]/20'
                    : 'border-white/12 bg-gradient-to-b from-black/95 via-onyx/95 to-black/90'
                }`}
                role="menu"
              >
                {menuItems.map((item, itemIndex) => (
                  <div
                    key={`mobile-menu-item-${item.key}`}
                    className={
                      itemIndex === 0
                        ? ''
                        : isLight
                          ? 'mt-2 border-t border-[#7fa3c1]/30 pt-2'
                          : 'mt-2 border-t border-white/10 pt-2'
                    }
                  >
                    <Link
                      href={item.href}
                      className={`block rounded-xl px-3 py-2 text-sm transition ${
                        item.key === activeMenuKey
                          ? isLight
                            ? 'bg-[#7fb0d9]/30 text-[#1e3248]'
                            : 'bg-saffron/20 text-ivory'
                          : isLight
                            ? 'text-[#2f4863]/85 hover:bg-[#7fa3c1]/20 hover:text-[#1d2f45]'
                            : 'text-ivory/80 hover:bg-white/10 hover:text-ivory'
                      }`}
                      role="menuitem"
                    >
                      {item.label}
                    </Link>
                  </div>
                ))}
                {!isAuthed && (
                  <Link
                    href={authCtaHref}
                    className={`block rounded-xl px-3 py-2 text-sm transition ${
                      isLight
                        ? 'text-[#2f4863]/85 hover:bg-[#7fa3c1]/20 hover:text-[#1d2f45]'
                        : 'text-ivory/80 hover:bg-white/10 hover:text-ivory'
                    }`}
                    role="menuitem"
                  >
                    {authCtaLabel}
                  </Link>
                )}
                {isAuthed && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      void signOut({ callbackUrl: `/${locale}` })
                    }}
                    className={`block w-full rounded-xl px-3 py-2 text-left text-sm transition ${
                      isLight
                        ? 'text-[#2f4863]/85 hover:bg-[#7fa3c1]/20 hover:text-[#1d2f45]'
                        : 'text-ivory/80 hover:bg-white/10 hover:text-ivory'
                    }`}
                    role="menuitem"
                  >
                    {t('signOut')}
                  </button>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => applyTheme(isLight ? 'dark' : 'light')}
            className={`relative h-10 w-16 shrink-0 overflow-hidden rounded-full border px-1.5 transition focus:outline-none focus:ring-2 sm:w-20 ${
              isLight
                ? 'border-[#7fa3c1]/55 bg-white/80 focus:ring-[#5c8db4]/35'
                : 'border-white/15 bg-white/10 focus:ring-saffron/30'
            }`}
            role="switch"
            aria-checked={isLight}
            aria-label={t('themeToggle')}
            title={isLight ? t('themeLight') : t('themeDark')}
          >
            <span className="sr-only">{t('themeToggle')}</span>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#f0d7a0]/80 via-[#9abed8]/70 to-[#1b2634]/80"
            />
            <span
              className={`pointer-events-none absolute inset-y-1 left-1 w-6 rounded-full border transition-transform sm:w-8 ${
                isLight
                  ? 'translate-x-0 border-[#f6e0b7]/80 bg-[#fff7e8]/90 shadow-[0_0_20px_rgba(240,215,160,0.45)]'
                  : 'translate-x-[1.5rem] border-white/30 bg-[#0f1622]/90 shadow-[0_0_20px_rgba(15,22,34,0.45)] sm:translate-x-[2.25rem]'
              }`}
            />
          </button>

          <div className="relative" ref={languageRef}>
            <button
              type="button"
              onClick={() => setLanguageOpen((open) => !open)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-medium transition sm:gap-2 sm:px-4 sm:text-sm ${
                isLight
                  ? 'border-[#7fa3c1]/45 bg-white/65 text-[#1f3348] hover:border-[#5c8db4]/60 hover:bg-white/85'
                  : 'border-white/15 bg-white/5 text-ivory hover:border-saffron/40 hover:bg-white/10'
              }`}
              aria-haspopup="true"
              aria-expanded={languageOpen}
              aria-controls="navbar-language"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                className="h-4 w-4"
                aria-hidden="true"
              >
                <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z" />
                <path d="M2 12h20" />
                <path d="M12 2c2.5 2.7 4 6.1 4 10s-1.5 7.3-4 10c-2.5-2.7-4-6.1-4-10s 1.5-7.3 4-10Z" />
              </svg>
              <span className="hidden sm:inline">
                {currentLanguage?.label ?? t('language')}
              </span>
              <span className="sm:hidden">
                {currentLanguage?.mobileLabel ?? t('language')}
              </span>
              <span className="text-xs opacity-80">{languageOpen ? '▲' : '▼'}</span>
            </button>

            {languageOpen && (
              <div
                id="navbar-language"
                className={`absolute right-0 mt-2 w-44 rounded-2xl border p-2 shadow-xl ${
                  isLight
                    ? 'border-[#7fa3c1]/40 bg-gradient-to-b from-[#f9fcff]/95 via-[#eff5fb]/95 to-[#e7eef7]/92 shadow-[#7fa3c1]/20'
                    : 'border-white/12 bg-gradient-to-b from-black/95 via-onyx/95 to-black/90'
                }`}
                role="menu"
              >
                {LANGUAGES.map((language) => (
                  <button
                    key={language.value}
                    type="button"
                    onClick={() => {
                      setLanguageOpen(false)
                      const segments = pathname.split('/')
                      if (segments.length > 1) {
                        segments[1] = language.value
                      } else {
                        segments.push(language.value)
                      }
                      const nextPath = segments.join('/') || `/${language.value}`
                      const hash = typeof window !== 'undefined' ? window.location.hash : ''
                      router.push(`${nextPath}${hash}`)
                    }}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition ${
                      isLight
                        ? 'text-[#2f4863]/85 hover:bg-[#7fa3c1]/20 hover:text-[#1d2f45]'
                        : 'text-ivory/80 hover:bg-white/10 hover:text-ivory'
                    }`}
                    role="menuitem"
                  >
                    <span>{language.label}</span>
                    {locale === language.value && (
                      <span className={isLight ? 'text-xs text-[#1d2f45]/70' : 'text-xs text-ivory/70'}>
                        {t('active')}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {!isAuthed && (
            <Link
              href={authCtaHref}
              className={`hidden rounded-full border px-4 py-2 text-sm font-medium transition md:inline-flex ${
                isLight
                  ? 'border-[#7fa3c1]/45 bg-white/65 text-[#1f3348] hover:border-[#5c8db4]/60 hover:bg-white/85'
                  : 'border-white/15 bg-white/5 text-ivory hover:border-saffron/40 hover:bg-white/10'
              }`}
            >
              {authCtaLabel}
            </Link>
          )}
          {isAuthed && (
            <div
              className={`hidden rounded-full border px-3 py-2 text-xs font-semibold tracking-wide md:inline-flex ${
                isLight
                  ? 'border-[#7fa3c1]/45 bg-white/70 text-[#1f3348]'
                  : 'border-white/15 bg-white/5 text-ivory/85'
              }`}
              title={`${t('signedIn')}: ${accountLabel}`}
              aria-label={`${t('signedIn')}: ${accountLabel}`}
            >
              {accountLabel}
            </div>
          )}
          {isAuthed && (
            <button
              type="button"
              onClick={() => void signOut({ callbackUrl: `/${locale}` })}
              className={`hidden rounded-full border px-4 py-2 text-sm font-medium transition md:inline-flex ${
                isLight
                  ? 'border-[#7fa3c1]/45 bg-white/65 text-[#1f3348] hover:border-[#5c8db4]/60 hover:bg-white/85'
                  : 'border-white/15 bg-white/5 text-ivory hover:border-saffron/40 hover:bg-white/10'
              }`}
            >
              {t('signOut')}
            </button>
          )}
          {showWallet && <WalletButton />}
        </div>
      </div>
    </nav>
  )
}
