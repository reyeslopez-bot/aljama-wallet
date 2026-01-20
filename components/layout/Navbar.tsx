// components/layout/Navbar.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import WalletButton from '@/components/wallet/ui/WalletButton'
import { BRAND } from '@/constants/brand'

const MENU_ITEMS = [
  { label: 'Overview', href: '/#overview' },
  { label: 'Create', href: '/#create' },
  { label: 'Connect', href: '/#connect' },
  { label: 'XRPL', href: '/#xrpl' },
]

const LANGUAGES = [
  { label: 'English', value: 'en' },
  { label: 'Hebrew', value: 'he' },
  { label: 'Arabic', value: 'ar' },
]

export default function Navbar() {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const [languageOpen, setLanguageOpen] = useState(false)
  const [activeLanguage, setActiveLanguage] = useState(LANGUAGES[0])
  const [activeHash, setActiveHash] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)
  const languageRef = useRef<HTMLDivElement>(null)

  const walletRoutes =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/wallet') ||
    pathname.startsWith('/swap') ||
    pathname.startsWith('/send')

  const showWallet = walletRoutes

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

  return (
    <nav
      className="
        fixed top-0 left-0 right-0 z-50
        text-zinc-200
        bg-gradient-to-b
        from-black/90
        via-zinc-900/80
        to-neutral-950/70
        border-b border-white/15
        backdrop-blur
        font-serif tracking-[0.12em]
      "
    >
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 md:px-6">
        <Link
          href="/"
          className="text-xl font-semibold tracking-wide text-zinc-100 transition hover:text-zinc-200"
        >
          {BRAND.name}
        </Link>

        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-1 md:flex">
            {MENU_ITEMS.map((item) => {
              const itemHash = getHashFromHref(item.href)
              const isActive = itemHash ? itemHash === activeHash : pathname === item.href
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                    isActive
                      ? 'bg-white/15 text-zinc-100'
                      : 'text-zinc-200 hover:bg-white/10 hover:text-zinc-100'
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
              className="flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm font-medium text-zinc-100 transition hover:border-white/40 hover:bg-white/10"
              aria-haspopup="true"
              aria-expanded={menuOpen}
              aria-controls="navbar-menu"
            >
              Menu
              <span className="text-xs opacity-80">{menuOpen ? '▲' : '▼'}</span>
            </button>

            {menuOpen && (
              <div
                id="navbar-menu"
                className="absolute right-0 mt-2 w-48 rounded-2xl border border-white/15 bg-gradient-to-b from-zinc-950/95 via-zinc-900/95 to-black/90 p-2 shadow-xl"
                role="menu"
              >
                {MENU_ITEMS.map((item) => {
                  const itemHash = getHashFromHref(item.href)
                  const isActive = itemHash ? itemHash === activeHash : pathname === item.href
                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      className={`block rounded-xl px-3 py-2 text-sm transition ${
                        isActive
                          ? 'bg-white/15 text-zinc-100'
                          : 'text-zinc-200 hover:bg-white/10 hover:text-zinc-100'
                      }`}
                      role="menuitem"
                    >
                      {item.label}
                    </Link>
                  )
                })}
              </div>
            )}
          </div>

          <div className="relative" ref={languageRef}>
            <button
              type="button"
              onClick={() => setLanguageOpen((open) => !open)}
              className="flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm font-medium text-zinc-100 transition hover:border-white/40 hover:bg-white/10"
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
              <span>{activeLanguage.label}</span>
              <span className="text-xs opacity-80">{languageOpen ? '▲' : '▼'}</span>
            </button>

            {languageOpen && (
              <div
                id="navbar-language"
                className="absolute right-0 mt-2 w-44 rounded-2xl border border-white/15 bg-gradient-to-b from-zinc-950/95 via-zinc-900/95 to-black/90 p-2 shadow-xl"
                role="menu"
              >
                {LANGUAGES.map((language) => (
                  <button
                    key={language.value}
                    type="button"
                    onClick={() => {
                      setActiveLanguage(language)
                      setLanguageOpen(false)
                    }}
                    className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-zinc-200 transition hover:bg-white/10 hover:text-zinc-100"
                    role="menuitem"
                  >
                    <span>{language.label}</span>
                    {activeLanguage.value === language.value && (
                      <span className="text-xs text-zinc-300">Active</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {showWallet && <WalletButton />}
        </div>
      </div>
    </nav>
  )
}
