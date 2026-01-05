// app/api/test-db/route.ts
import { NextResponse } from 'next/server'
import { getWallets } from '@/services/wallet.service'
import { getDailySummaries } from '@/infra/utils/summary.service'

export const dynamic = 'force-dynamic'

export async function GET() {
  if (process.env.CI === 'true' || process.env.NODE_ENV === 'production') {
    return NextResponse.json({ ok: false, reason: 'disabled' }, { status: 404 })
  }

  const [wallets, summaries] = await Promise.all([getWallets(), getDailySummaries()])
  return NextResponse.json({ wallets, summaries })
}