'use client'

import { useTrackUserWallet } from '@/hooks/useTrackUserWallet'
import { useEffect } from 'react'
import { useDynamicInfoStore } from '@/hooks/useDynamicInfoStore'

export default function ClientTrackWallet() {
  const { status, error } = useTrackUserWallet()
  const setTrackingStatus = useDynamicInfoStore((s) => s.setTrackingStatus)

  useEffect(() => {
    setTrackingStatus(status, error?.message ?? null)
  }, [error?.message, setTrackingStatus, status])

  return null
}
