// components/layout/Navbar.tsx
'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import WalletButton from '@/components/wallet/ui/WalletButton'
import { BRAND } from '@/constants/brand'
import { useLocale, useTranslations } from 'next-intl'
import { useSession } from 'next-auth/react'

const LANGUAGES = [
  { label: 'English', value: 'en' },
  { label: 'עברית', value: 'he' },
  { label: 'العربية', value: 'ar' },
]

export default function Navbar() {
  const t = useTranslations('navbar')
  const locale = useLocale()
  const pathname = usePathname()
  const router = useRouter()
  const { status } = useSession()
  const isAuthed = status === 'authenticated'
  const [menuOpen, setMenuOpen] = useState(false)
  const [languageOpen, setLanguageOpen] = useState(false)
  const [activeHash, setActiveHash] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)
  const languageRef = useRef<HTMLDivElement>(null)

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
    const updateHash = () => {
      setActiveHash(window.location.hash ?? '')
    }

    updateHash()
    window.addEventListener('hashchange', updateHash)
    return () => window.removeEventListener('hashchange', updateHash)
  }, [])

  useEffect(() => {
    setMenuOpen(false)
    setLanguageOpen(false)
    setActiveHash(window.location.hash ?? '')
  }, [pathname])

  const getHashFromHref = (href: string) => {
    const hashIndex = href.indexOf('#')
    return hashIndex === -1 ? '' : href.slice(hashIndex)
  }

  const menuItems = [
    { label: t('overview'), href: `/${locale}/#overview` },
    { label: t('create'), href: `/${locale}/#create` },
    { label: t('connect'), href: `/${locale}/#connect` },
    { label: t('xrpl'), href: `/${locale}/#xrpl` },
  ]

  return (
    <nav
      className="
        fixed top-0 left-0 right-0 z-50
        text-ivory/90
        bg-gradient-to-b
        from-black/95
        via-onyx/90
        to-black/70
        border-b border-saffron/20
        backdrop-blur-xl
        shadow-[0_18px_50px_rgba(0,0,0,0.45)]
      "
    >
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 md:px-6">
        <Link
          href={`/${locale}`}
          className="font-display text-xl font-semibold tracking-[0.18em] text-ivory transition hover:text-sand"
        >
          {BRAND.name}
        </Link>

        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-1 md:flex">
            {menuItems.map((item) => {
              const itemHash = getHashFromHref(item.href)
              const isActive = itemHash ? itemHash === activeHash : pathname === item.href
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`rounded-full px-4 py-2 text-sm font-medium tracking-wide transition ${
                    isActive
                      ? 'bg-saffron/20 text-ivory'
                      : 'text-ivory/80 hover:bg-white/10 hover:text-ivory'
                  }`}
                >
                  {item.label}
                </Link>
              )
            })}
          </div>

          <div className="relative md:hidden" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-ivory transition hover:border-saffron/40 hover:bg-white/10"
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
                className="absolute right-0 mt-2 w-48 rounded-2xl border border-white/12 bg-gradient-to-b from-black/95 via-onyx/95 to-black/90 p-2 shadow-xl"
                role="menu"
              >
                {menuItems.map((item) => {
                  const itemHash = getHashFromHref(item.href)
                  const isActive = itemHash ? itemHash === activeHash : pathname === item.href
                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      className={`block rounded-xl px-3 py-2 text-sm transition ${
                        isActive
                          ? 'bg-saffron/20 text-ivory'
                          : 'text-ivory/80 hover:bg-white/10 hover:text-ivory'
                      }`}
                      role="menuitem"
                    >
                      {item.label}
                    </Link>
                  )
                })}
                {!isAuthed && (
                  <Link
                    href={`/${locale}/login`}
                    className="block rounded-xl px-3 py-2 text-sm text-ivory/80 transition hover:bg-white/10 hover:text-ivory"
                    role="menuitem"
                  >
                    {t('signIn')}
                  </Link>
                )}
              </div>
            )}
          </div>

          <div className="relative" ref={languageRef}>
            <button
              type="button"
              onClick={() => setLanguageOpen((open) => !open)}
              className="flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-ivory transition hover:border-saffron/40 hover:bg-white/10"
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
              <span>{LANGUAGES.find((lang) => lang.value === locale)?.label ?? t('language')}</span>
              <span className="text-xs opacity-80">{languageOpen ? '▲' : '▼'}</span>
            </button>

            {languageOpen && (
              <div
                id="navbar-language"
                className="absolute right-0 mt-2 w-44 rounded-2xl border border-white/12 bg-gradient-to-b from-black/95 via-onyx/95 to-black/90 p-2 shadow-xl"
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
                    className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-ivory/80 transition hover:bg-white/10 hover:text-ivory"
                    role="menuitem"
                  >
                    <span>{language.label}</span>
                    {locale === language.value && (
                      <span className="text-xs text-ivory/70">{t('active')}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {!isAuthed && (
            <Link
              href={`/${locale}/login`}
              className="hidden rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-ivory transition hover:border-saffron/40 hover:bg-white/10 md:inline-flex"
            >
              {t('signIn')}
            </Link>
          )}
          {showWallet && <WalletButton />}
        </div>
      </div>
    </nav>
  )
}
