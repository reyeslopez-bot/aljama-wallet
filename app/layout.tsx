// app/layout.tsx
import './globals.css'
import type { ReactNode } from 'react'
import type { Metadata, Viewport } from 'next'
import { El_Messiri, Manrope } from 'next/font/google'
import { getLocale } from 'next-intl/server'
import AppHydrationMarker from '@/components/system/AppHydrationMarker.client'
import { defaultLocale, isRtlLocale } from '@/i18n/routing'

export const metadata: Metadata = {
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-dark.svg', media: '(prefers-color-scheme: dark)' },
    ],
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#e6cfa3' },
    { media: '(prefers-color-scheme: dark)', color: '#0f1115' },
  ],
}

const bodyFont = Manrope({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-body',
  fallback: ['Segoe UI', 'system-ui', 'sans-serif'],
})

const displayFont = El_Messiri({
  subsets: ['latin', 'arabic'],
  display: 'swap',
  variable: '--font-display',
  fallback: ['Georgia', 'serif'],
})

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale().catch(() => defaultLocale)
  const textDirection = isRtlLocale(locale) ? 'rtl' : 'ltr'

  return (
    <html lang={locale} dir={textDirection} data-locale-dir={textDirection}>
      <body
        className={`${bodyFont.variable} ${displayFont.variable} dark min-h-screen flex flex-col antialiased text-foreground bg-surface`}
      >
        <AppHydrationMarker />
        {children}
      </body>
    </html>
  )
}
