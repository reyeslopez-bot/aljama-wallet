// app/api/test-db/route.ts
import { NextResponse } from 'next/server'
import { getWallets } from '@/services/wallet.service'
import { getDailySummaries } from '@/services/summary.service'

export async function GET() {
  const [wallets, summaries] = await Promise.all([
    getWallets(),
    getDailySummaries(),
  ])
  return NextResponse.json({ wallets, summaries })
}
