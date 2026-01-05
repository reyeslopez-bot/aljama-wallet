// app/api/test-db/route.ts
import { NextResponse } from 'next/server'
import { getWallets } from '@/services/wallet.service'
import { getDailySummaries } from '@/infra/utils/summary.service'

export const dynamic = 'force-dynamic'

export async function GET() {
// app/api/test-db/route.ts
if (
    process.env.NODE_ENV === 'production' ||
    (process.env.CI === 'true' && process.env.ENABLE_TEST_DB_ROUTE !== 'true')
  ) {
    return NextResponse.json({ ok: false, reason: 'disabled' }, { status: 404 })
  }

  const [wallets, summaries] = await Promise.all([getWallets(), getDailySummaries()])
  return NextResponse.json({ wallets, summaries })
}