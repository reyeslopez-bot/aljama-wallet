// tests/app/api/test-db/route.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

type WalletMock = { id: string }
type SummaryMock = { date: string }

describe('app/api/test-db route', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()

    // Route disables in CI=true or NODE_ENV=production.
    // Force the enabled branch in tests.
    vi.stubEnv('CI', 'false')
    vi.stubEnv('NODE_ENV', 'test')

    vi.mock('@/services/wallet.service', () => ({
      getWallets: vi.fn<() => Promise<WalletMock[]>>().mockResolvedValue([{ id: 'wallet-1' }]),
    }))

    // MUST match the import path in route.ts
    vi.mock('@/infra/utils/summary.service', () => ({
      getDailySummaries: vi
        .fn<() => Promise<SummaryMock[]>>()
        .mockResolvedValue([{ date: '2024-01-01' }]),
    }))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns wallets and summaries when enabled', async () => {
    const { GET } = await import('@/app/api/test-db/route')
    const res = await GET()
    expect(await res.json()).toEqual({
      wallets: [{ id: 'wallet-1' }],
      summaries: [{ date: '2024-01-01' }],
    })
  })
})
