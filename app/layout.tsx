// app/layout.tsx
import './globals.css'
import type { ReactNode } from 'react'
import { cookies } from 'next/headers'
import { defaultLocale, isRtlLocale } from '@/i18n/routing'

export default async function RootLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies()
  const locale = cookieStore.get('NEXT_LOCALE')?.value ?? defaultLocale
  const textDirection = isRtlLocale(locale) ? 'rtl' : 'ltr'

  return (
    <html lang={locale} dir="ltr" data-locale-dir={textDirection}>
      <body className="dark min-h-screen flex flex-col antialiased text-foreground bg-surface">
        {children}
      </body>
    </html>
  )
}
