'use client'

import { useEffect } from 'react'
import { isRtlLocale } from '@/i18n/routing'

export default function LocaleDocumentSync({ locale }: { locale: string }) {
  useEffect(() => {
    const html = document.documentElement
    const textDirection = isRtlLocale(locale) ? 'rtl' : 'ltr'
    html.lang = locale
    html.dir = textDirection
    html.dataset.localeDir = textDirection
  }, [locale])

  return null
}
