import { describe, expect, it } from 'vitest'
import {
  assertEvmTransactionSigningAccount,
  assertXrplTransactionSigningAccount,
} from '@/lib/signing/types'

const baseAccount = {
  id: 'wallet-1',
  accountRef: 'ref-1',
  signerBackend: 'local' as const,
  vaultId: 'public' as const,
  derivationPath: null,
  policy: {
    requiresSecondFactor: false,
    requiresPQAttestation: false,
  },
  pqcBinding: null,
  pqcBindingHash: null,
  createdAt: new Date('2026-03-03T00:00:00Z'),
}

describe('live signing account assertions', () => {
  it('accepts classical EVM secp256k1 accounts', () => {
    const account = assertEvmTransactionSigningAccount({
      ...baseAccount,
      chain: 'EVM',
      address: '0x000000000000000000000000000000000000beef',
      pubKey: '0x04abcd',
      keyType: 'secp256k1',
    })

    expect(account.chain).toBe('EVM')
    expect(account.keyType).toBe('secp256k1')
  })

  it('rejects non-secp256k1 EVM accounts for live signing', () => {
    expect(() =>
      assertEvmTransactionSigningAccount({
        ...baseAccount,
        chain: 'EVM',
        address: '0x000000000000000000000000000000000000beef',
        pubKey: 'EDabcd',
        keyType: 'ed25519',
      }),
    ).toThrow(/UNSUPPORTED_EVM_SIGNING_ACCOUNT/)
  })

  it('accepts classical XRPL accounts with a public key', () => {
    const account = assertXrplTransactionSigningAccount({
      ...baseAccount,
      chain: 'XRPL',
      address: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
      pubKey: 'EDABCDEF',
      keyType: 'ed25519',
    })

    expect(account.chain).toBe('XRPL')
    expect(account.pubKey).toBe('EDABCDEF')
  })

  it('rejects XRPL execution accounts that do not expose a classical public key', () => {
    expect(() =>
      assertXrplTransactionSigningAccount({
        ...baseAccount,
        chain: 'XRPL',
        address: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
        pubKey: null,
        keyType: 'ed25519',
      }),
    ).toThrow(/UNSUPPORTED_XRPL_SIGNING_ACCOUNT/)
  })
})
