// infra/utils/useHumanGate.tsx
'use client'

import { useEffect } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { getHumanOk } from '@/lib/storage/humanGate'

export function useHumanGate() {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()

  useEffect(() => {
    const ok = getHumanOk()
    if (ok) return

    // avoid infinite loop if we are already on /unlock
    if (pathname === '/unlock') return

    const next = encodeURIComponent(pathname + (sp.toString() ? `?${sp}` : ''))
    router.replace(`/unlock?next=${next}`)
  }, [router, pathname, sp])
}
