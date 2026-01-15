// components/layout/Navbar.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import WalletButton from '@/components/wallet/ui/WalletButton'
import { BRAND } from '@/constants/brand'

const MENU_ITEMS = [
  { label: 'Overview', href: '/' },
  { label: 'Security', href: '/security' },
  { label: 'Docs', href: '/docs' },
  { label: 'Support', href: '/support' },
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
  const menuRef = useRef<HTMLDivElement>(null)
  const languageRef = useRef<HTMLDivElement>(null)

  // Wallet UI should ONLY appear on routes where full wagmi config is active
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
    setMenuOpen(false)
    setLanguageOpen(false)
  }, [pathname])

  return (
    <nav
      className="
        fixed top-0 left-0 right-0 z-50
        text-foreground
        bg-gradient-to-b
        from-[#23170f]/85
        via-[#3a2616]/70
        border-b border-[#5a3c24]/50
        backdrop-blur-md
      "
    >
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3 md:px-6">
        <Link href="/" className="text-xl font-semibold tracking-wide text-[#f8f1e4]">
          {BRAND.name}
        </Link>

        <div className="flex items-center gap-3">
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="flex items-center gap-2 rounded-full border border-[#7a5636]/60 bg-[#2a1b12]/80 px-4 py-2 text-sm font-medium text-[#f8f1e4] transition hover:border-[#a9764b]/80 hover:bg-[#3a2518]/80"
              aria-haspopup="true"
              aria-expanded={menuOpen}
            >
              Menu
              <span className="text-xs opacity-80">{menuOpen ? '▲' : '▼'}</span>
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-2 w-48 rounded-2xl border border-[#7a5636]/60 bg-[#1f140c]/95 p-2 shadow-xl">
                {MENU_ITEMS.map((item) => (
                  <Link
                    key={item.label}
                    href={item.href}
                    className="block rounded-xl px-3 py-2 text-sm text-[#f5e8d6] transition hover:bg-[#3a2518]/80"
                    onClick={() => setMenuOpen(false)}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="relative" ref={languageRef}>
            <button
              type="button"
              onClick={() => setLanguageOpen((open) => !open)}
              className="flex items-center gap-2 rounded-full border border-[#7a5636]/60 bg-[#2a1b12]/80 px-4 py-2 text-sm font-medium text-[#f8f1e4] transition hover:border-[#a9764b]/80 hover:bg-[#3a2518]/80"
              aria-haspopup="true"
              aria-expanded={languageOpen}
            >
              <span className="inline-flex h-4 w-4 items-center justify-center">
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
                  <path d="M12 2c2.5 2.7 4 6.1 4 10s-1.5 7.3-4 10c-2.5-2.7-4-6.1-4-10s1.5-7.3 4-10Z" />
                </svg>
              </span>
              <span>{activeLanguage.label}</span>
              <span className="text-xs opacity-80">{languageOpen ? '▲' : '▼'}</span>
            </button>
            {languageOpen && (
              <div className="absolute right-0 mt-2 w-44 rounded-2xl border border-[#7a5636]/60 bg-[#1f140c]/95 p-2 shadow-xl">
                {LANGUAGES.map((language) => (
                  <button
                    key={language.value}
                    type="button"
                    onClick={() => {
                      setActiveLanguage(language)
                      setLanguageOpen(false)
                    }}
                    className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-[#f5e8d6] transition hover:bg-[#3a2518]/80"
                  >
                    <span>{language.label}</span>
                    {activeLanguage.value === language.value && (
                      <span className="text-xs text-[#d6b487]">Active</span>
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
