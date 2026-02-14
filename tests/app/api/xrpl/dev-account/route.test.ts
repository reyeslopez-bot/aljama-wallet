import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetDevXrplAccount } = vi.hoisted(() => ({
  mockGetDevXrplAccount: vi.fn(),
}))

vi.mock('@/lib/xrpl', () => ({
  getDevXrplAccount: mockGetDevXrplAccount,
}))

vi.mock('@/lib/security/runtime', () => ({
  isStrictMode: false,
}))

vi.mock('@/lib/security/internal-token', () => ({
  hasValidInternalToken: vi.fn(() => true),
}))

import { GET } from '@/app/api/xrpl/dev-account/route'

describe('app/api/xrpl/dev-account route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects invalid network ids', async () => {
    const response = await GET(new Request('http://localhost/api/xrpl/dev-account?network=bad-net'))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.code).toBe('invalid_network')
    expect(mockGetDevXrplAccount).not.toHaveBeenCalled()
  })

  it('uses default testnet when network is omitted', async () => {
    mockGetDevXrplAccount.mockResolvedValue({
      address: 'rDefault',
      funded: true,
      xrpBalance: '12.3',
    })

    const response = await GET(new Request('http://localhost/api/xrpl/dev-account'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mockGetDevXrplAccount).toHaveBeenCalledWith('testnet')
    expect(body.network).toBe('testnet')
    expect(body.account.address).toBe('rDefault')
  })

  it('passes through explicitly selected network', async () => {
    mockGetDevXrplAccount.mockResolvedValue({
      address: 'rMainnet',
      funded: false,
      xrpBalance: '0',
      needsFunding: true,
    })

    const response = await GET(new Request('http://localhost/api/xrpl/dev-account?network=mainnet'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mockGetDevXrplAccount).toHaveBeenCalledWith('mainnet')
    expect(body.network).toBe('mainnet')
    expect(body.account.address).toBe('rMainnet')
  })
})
