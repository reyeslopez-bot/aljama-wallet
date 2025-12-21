// app/ClientOnly.tsx
'use client'

import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'

type Props = {
  children: ReactNode
  fallback?: ReactNode
}

export default function ClientOnly({ children, fallback = null }: Props) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return <>{fallback}</>
  return <>{children}</>
}