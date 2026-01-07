'use client'

import { useWalletGate } from '@/infra/utils/useWalletGate'
import DashboardClient from './DashboardClient'

export default function DashboardPage() {
  useWalletGate('require-unlocked')
  return <DashboardClient />
}