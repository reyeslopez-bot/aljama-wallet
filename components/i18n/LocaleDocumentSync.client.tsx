'use client'

import { useEffect } from 'react'
import { isRtlLocale } from '@/i18n/routing'

export default function LocaleDocumentSync({ locale }: { locale: string }) {
  useEffect(() => {
    const html = document.documentElement
    html.lang = locale
    html.dir = 'ltr'
    html.dataset.localeDir = isRtlLocale(locale) ? 'rtl' : 'ltr'
  }, [locale])

  return null
}
