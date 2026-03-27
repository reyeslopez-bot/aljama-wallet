import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockProviderCtor,
  mockProviderGetNetwork,
} = vi.hoisted(() => ({
  mockProviderCtor: vi.fn(),
  mockProviderGetNetwork: vi.fn(),
}))

vi.mock('ethers', () => ({
  JsonRpcProvider: class MockJsonRpcProvider {
    readonly url: string

    constructor(url: string) {
      this.url = url
      mockProviderCtor(url)
    }

    getNetwork() {
      return mockProviderGetNetwork(this.url)
    }
  },
}))

describe('evm-rpc', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.unstubAllEnvs()

    const { resetEvmRpcState } = await import('@/lib/evm-rpc')
    resetEvmRpcState()
  })

  it('resolves configured providers from EVM_RPC_URLS by chain id', async () => {
    vi.stubEnv('EVM_RPC_URL', '')
    vi.stubEnv('EVM_RPC_URLS', '1:https://rpc-one.example,8453:https://rpc-base.example')
    mockProviderGetNetwork.mockImplementation(async (url: string) => ({
      chainId: url.includes('base') ? 8453n : 1n,
    }))

    const {
      getAvailableEvmRpcChainIds,
      getEvmProviderForChain,
    } = await import('@/lib/evm-rpc')

    const availableChainIds = await getAvailableEvmRpcChainIds()
    const provider = await getEvmProviderForChain(8453)

    expect(availableChainIds).toEqual([1, 8453])
    expect(provider).toBeTruthy()
    expect(mockProviderCtor).toHaveBeenCalledWith('https://rpc-base.example')
    expect(mockProviderCtor).toHaveBeenCalledWith('https://rpc-one.example')
  })

  it('keeps single-url fallback compatibility and surfaces chain mismatches', async () => {
    vi.stubEnv('EVM_RPC_URL', 'https://rpc-mainnet.example')
    vi.stubEnv('EVM_RPC_URLS', '')
    mockProviderGetNetwork.mockResolvedValue({ chainId: 1n })

    const {
      getAvailableEvmRpcChainIds,
      getEvmProviderForChain,
    } = await import('@/lib/evm-rpc')

    await expect(getEvmProviderForChain(8453)).rejects.toMatchObject({
      code: 'EVM_RPC_CHAIN_MISMATCH',
      requestedChainId: 8453,
      actualChainId: 1,
    })
    await expect(getEvmProviderForChain(1)).resolves.toBeTruthy()
    await expect(getAvailableEvmRpcChainIds()).resolves.toEqual([1])
    expect(mockProviderCtor).toHaveBeenCalledWith('https://rpc-mainnet.example')
  })
})
