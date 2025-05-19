// app/api/test-db/route.ts
import { getWallets } from '@/services/wallet.service'
import { getDailySummaries } from '@/services/summary.service'

export async function GET() {
    const wallets = await getWallets()
    const summaries = await getDailySummaries()

    return Response.json({ wallets, summaries })
}

