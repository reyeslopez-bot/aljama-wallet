// app/layout.tsx
import './globals.css'
import type { ReactNode } from 'react'
import type { Metadata } from 'next'   // ✅ add this
import { El_Messiri, Manrope } from 'next/font/google'
import { cookies } from 'next/headers'
import { defaultLocale, isRtlLocale } from '@/i18n/routing'

/* ✅ ADD METADATA HERE — OUTSIDE THE COMPONENT */
export const metadata: Metadata = {
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-dark.svg', media: '(prefers-color-scheme: dark)' },
    ],
  },
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#e6cfa3' },
    { media: '(prefers-color-scheme: dark)', color: '#0f1115' },
  ],
}

/* fonts stay unchanged */
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

/* component stays unchanged */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies()
  const locale = cookieStore.get('NEXT_LOCALE')?.value ?? defaultLocale
  const textDirection = isRtlLocale(locale) ? 'rtl' : 'ltr'

  return (
    <html lang={locale} dir={textDirection} data-locale-dir={textDirection}>
      <body
        className={`${bodyFont.variable} ${displayFont.variable} dark min-h-screen flex flex-col antialiased text-foreground bg-surface`}
      >
        {children}
      </body>
    </html>
  )
}