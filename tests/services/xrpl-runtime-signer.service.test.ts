import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockResolveSigningAccount } = vi.hoisted(() => ({
  mockResolveSigningAccount: vi.fn(),
}))

vi.mock('@/services/signer.service', () => ({
  resolveSigningAccount: mockResolveSigningAccount,
}))

describe('xrpl-runtime-signer.service', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    mockResolveSigningAccount.mockResolvedValue({
      id: 'wallet-1',
      accountRef: 'XRPL:ed25519:managed',
      chain: 'XRPL',
      address: 'rDsbeomae4FXwgQTJp9Rs64Qg9vDiTCdBv',
      pubKey: 'EDPUBKEY',
      keyType: 'ed25519',
      signerBackend: 'local',
      vaultId: 'vault',
      derivationPath: null,
      policy: { requiresSecondFactor: false, requiresPQAttestation: false },
      pqcBinding: null,
      pqcBindingHash: null,
      createdAt: new Date(0),
    })
  })

  // This is the operational switch we wanted: once a distributor wallet ID is
  // configured, runtime signing should use the managed hot wallet instead of an
  // env seed reference.
  it('returns a managed distributor account ref when XRPL_DISTRIBUTOR_WALLET_ID is configured', async () => {
    vi.stubEnv('XRPL_DISTRIBUTOR_WALLET_ID', 'wallet-hot-1')

    const {
      getConfiguredXrplAccountRef,
      resolveConfiguredXrplAccount,
    } = await import('@/services/xrpl-runtime-signer.service')

    expect(getConfiguredXrplAccountRef('distributor')).toEqual({
      kind: 'managed',
      walletId: 'wallet-hot-1',
    })

    const account = await resolveConfiguredXrplAccount('distributor')
    expect(account.address).toBe('rDsbeomae4FXwgQTJp9Rs64Qg9vDiTCdBv')
    expect(mockResolveSigningAccount).toHaveBeenCalledWith({
      kind: 'managed',
      walletId: 'wallet-hot-1',
    })
  })

  // Backward compatibility matters because operators may not set the new wallet
  // IDs immediately. In that case the runtime should continue using the role-
  // scoped env signer reference.
  it('falls back to the env signer role when no managed wallet id is configured', async () => {
    const { getConfiguredXrplAccountRef } = await import('@/services/xrpl-runtime-signer.service')

    expect(getConfiguredXrplAccountRef('distributor')).toEqual({
      kind: 'xrpl-env',
      role: 'distributor',
    })
  })
})
