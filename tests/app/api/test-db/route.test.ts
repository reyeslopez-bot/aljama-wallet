import { vi, describe, expect, it, beforeEach, afterEach } from 'vitest'

type WalletMock = { id: string }
type SummaryMock = { date: string }

const enableEnvKey = 'ENABLE_TEST_DB_ROUTE'

describe('app/api/test-db route', () => {
  let originalEnv: string | undefined

  beforeEach(() => {
    originalEnv = process.env[enableEnvKey]
    vi.resetModules()
    vi.clearAllMocks()
  })

  afterEach(() => {
    if (originalEnv === undefined) delete process.env[enableEnvKey]
    else process.env[enableEnvKey] = originalEnv
  })

  it('returns wallets and summaries when enabled', async () => {
    process.env[enableEnvKey] = 'true'

    vi.mock('@/services/wallet.service', () => ({
      getWallets: vi.fn<() => Promise<WalletMock[]>>()
        .mockResolvedValue([{ id: 'wallet-1' }]),
    }))

    vi.mock('@/services/summary.service', () => ({
      getDailySummaries: vi.fn<() => Promise<SummaryMock[]>>()
        .mockResolvedValue([{ date: '2024-01-01' }]),
    }))

    const { GET } = await import('@/app/api/test-db/route')

    const res = await GET()
    expect(await res.json()).toEqual({
      wallets: [{ id: 'wallet-1' }],
      summaries: [{ date: '2024-01-01' }],
    })
  })
})