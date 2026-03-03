import { describe, expect, it } from 'vitest'
import { createWalletPqcEncryptedMaterial, verifyWalletPqcBinding } from '@/lib/pqc/provider'
import { buildAccountRef } from '@/lib/signing/types'

describe('wallet PQC binding provider', () => {
  it('creates a verifiable ML-DSA-65 binding for a classical wallet key', async () => {
    const subject = {
      accountRef: buildAccountRef({
        chain: 'EVM',
        keyType: 'secp256k1',
        pubKey: '0x04abcd',
        address: '0x000000000000000000000000000000000000dEaD',
      }),
      chain: 'EVM' as const,
      address: '0x000000000000000000000000000000000000dEaD',
      keyType: 'secp256k1' as const,
      scheme: 'ecdsa' as const,
      publicKey: '0x04abcd',
      publicKeyFormat: 'hex' as const,
    }

    const material = await createWalletPqcEncryptedMaterial({ subject })

    expect(material.binding.scheme).toBe('ml-dsa-65')
    expect(material.binding.role).toBe('vault-identity')
    expect(material.binding.subject).toEqual(subject)
    await expect(verifyWalletPqcBinding(material.binding)).resolves.toBe(true)
  })

  it('fails verification if the signed binding statement is tampered', async () => {
    const material = await createWalletPqcEncryptedMaterial({
      subject: {
        accountRef: buildAccountRef({
          chain: 'XRPL',
          keyType: 'ed25519',
          pubKey: 'EDABCDEF',
          address: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
        }),
        chain: 'XRPL',
        address: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
        keyType: 'ed25519',
        scheme: 'eddsa',
        publicKey: 'EDABCDEF',
        publicKeyFormat: 'hex',
      },
    })

    const tampered = {
      ...material.binding,
      challenge: {
        ...material.binding.challenge,
        statement: material.binding.challenge.statement.replace('vault-identity', 'wallet-identity'),
      },
    }

    await expect(verifyWalletPqcBinding(tampered)).resolves.toBe(false)
  })
})
