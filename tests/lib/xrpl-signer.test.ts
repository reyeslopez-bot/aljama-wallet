import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCreateXrplWalletFromSeed } = vi.hoisted(() => ({
  mockCreateXrplWalletFromSeed: vi.fn((seed: string, keyType: 'secp256k1' | 'ed25519') => ({
    publicKey: `PUB-${seed}-${keyType}`,
    classicAddress:
      seed === 'issuer-seed'
        ? 'rDsbeomae4FXwgQTJp9Rs64Qg9vDiTCdBv'
        : seed === 'distributor-seed'
          ? 'r3kmLJN5D28dHuH8vZNUZpMC43pEHpaocV'
          : 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
  })),
}))

vi.mock('@/infra/xrpl/client', () => ({
  createXrplWalletFromSeed: mockCreateXrplWalletFromSeed,
}))

describe('lib/xrpl-signer', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  // Dedicated issuer/distributor env vars are optional. If they are not set,
  // the split-role helpers should still resolve to the legacy default signer so
  // the repo stays backward compatible while operators migrate config.
  it('falls back issuer and distributor roles to the default env signer', async () => {
    vi.stubEnv('XRPL_SIGNER_SEED', 'default-seed')

    const {
      getXrplDistributorAccount,
      getXrplIssuerAccount,
      getXrplSignerAccount,
    } = await import('@/lib/xrpl-signer')

    expect(getXrplSignerAccount().address).toBe('rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh')
    expect(getXrplIssuerAccount().address).toBe('rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh')
    expect(getXrplDistributorAccount().address).toBe('rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh')
    expect(mockCreateXrplWalletFromSeed).toHaveBeenCalledWith('default-seed', 'ed25519')
  })

  // When dedicated env vars are present, the helpers should return distinct
  // accounts so issuer config and operational distribution can be isolated.
  it('prefers dedicated issuer and distributor env signer variables when configured', async () => {
    vi.stubEnv('XRPL_SIGNER_SEED', 'default-seed')
    vi.stubEnv('XRPL_ISSUER_SEED', 'issuer-seed')
    vi.stubEnv('XRPL_DISTRIBUTOR_SEED', 'distributor-seed')
    vi.stubEnv('XRPL_DISTRIBUTOR_KEY_TYPE', 'secp256k1')

    const {
      getXrplDistributorAccount,
      getXrplIssuerAccount,
      getXrplSignerAccount,
    } = await import('@/lib/xrpl-signer')

    expect(getXrplSignerAccount().id).toBe('xrpl-env')
    expect(getXrplSignerAccount().address).toBe('rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh')

    expect(getXrplIssuerAccount().id).toBe('xrpl-env-issuer')
    expect(getXrplIssuerAccount().address).toBe('rDsbeomae4FXwgQTJp9Rs64Qg9vDiTCdBv')

    expect(getXrplDistributorAccount().id).toBe('xrpl-env-distributor')
    expect(getXrplDistributorAccount().address).toBe('r3kmLJN5D28dHuH8vZNUZpMC43pEHpaocV')
    expect(getXrplDistributorAccount().keyType).toBe('secp256k1')

    expect(mockCreateXrplWalletFromSeed).toHaveBeenCalledWith('issuer-seed', 'ed25519')
    expect(mockCreateXrplWalletFromSeed).toHaveBeenCalledWith('distributor-seed', 'secp256k1')
  })
})
