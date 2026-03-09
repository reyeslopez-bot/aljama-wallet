// app/layout.tsx
import './globals.css'
import type { ReactNode } from 'react'
import { El_Messiri, Manrope } from 'next/font/google'
import { cookies } from 'next/headers'
import { defaultLocale, isRtlLocale } from '@/i18n/routing'

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
