'use client'

import { useEffect } from 'react'

export default function AppHydrationMarker() {
  useEffect(() => {
    document.documentElement.dataset.appHydrated = 'true'
  }, [])

  return null
}
