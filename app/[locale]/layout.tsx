import type { ReactNode } from 'react'
import Providers from '../Providers.client'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages, setRequestLocale } from 'next-intl/server'
import { locales } from '@/i18n/routing'
import { notFound } from 'next/navigation'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { logError } from '@/lib/security/logging'

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!locales.includes(locale as (typeof locales)[number])) {
    notFound()
  }

  setRequestLocale(locale)
  const messages = await getMessages()
  let session = null
  try {
    session = await getServerSession(authOptions)
  } catch (error) {
    logError('auth-session', error)
  }

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <Providers session={session}>{children}</Providers>
    </NextIntlClientProvider>
  )
}
