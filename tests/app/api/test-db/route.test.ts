import { vi, describe, expect, it } from 'vitest'

type WalletMock = { id: string }
type SummaryMock = { date: string }

vi.mock('@/services/wallet.service', () => ({
  getWallets: vi.fn<[], Promise<WalletMock[]>>().mockResolvedValue([{ id: 'wallet-1' }]),
}))

vi.mock('@/services/summary.service', () => ({
  getDailySummaries: vi.fn<[], Promise<SummaryMock[]>>().mockResolvedValue([{ date: '2024-01-01' }]),
}))

import { GET } from '@/app/api/test-db/route'

describe('app/api/test-db route', () => {
  it('returns wallets and summaries without crashing on import', async () => {
    const response = await GET()
    const payload = await response.json()

    expect(payload).toEqual({
      wallets: [{ id: 'wallet-1' }],
      summaries: [{ date: '2024-01-01' }],
    })
  })
})
