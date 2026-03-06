import { describe, expect, it } from 'vitest'
import { buildPqcBindingHashes, buildXrplPqcAnchorMemo } from '@/lib/pqc/commitment'
import { createWalletPqcEncryptedMaterial } from '@/lib/pqc/provider'
import { buildAccountRef } from '@/lib/signing/types'

async function buildBinding() {
  const material = await createWalletPqcEncryptedMaterial({
    subject: {
      accountRef: buildAccountRef({
        chain: 'EVM',
        keyType: 'secp256k1',
        pubKey: '0x04abcd',
        address: '0x000000000000000000000000000000000000dEaD',
      }),
      chain: 'EVM',
      address: '0x000000000000000000000000000000000000dEaD',
      keyType: 'secp256k1',
      scheme: 'ecdsa',
      publicKey: '0x04abcd',
      publicKeyFormat: 'hex',
    },
  })

  return material.binding
}

describe('PQC commitment hashing', () => {
  it('produces stable canonical hashes for the same binding and URI', async () => {
    const binding = await buildBinding()
    const first = buildPqcBindingHashes(
      binding,
      'https://app.example.com/api/public/pqc-bindings/example',
    )
    const second = buildPqcBindingHashes(
      binding,
      'https://app.example.com/api/public/pqc-bindings/example',
    )

    expect(second).toEqual(first)
  })

  it('keeps bindingHash stable while URI changes only affect uriHash', async () => {
    const binding = await buildBinding()
    const first = buildPqcBindingHashes(
      binding,
      'https://app.example.com/api/public/pqc-bindings/example-a',
    )
    const second = buildPqcBindingHashes(
      binding,
      'https://app.example.com/api/public/pqc-bindings/example-b',
    )

    expect(first.bindingHash).toBe(second.bindingHash)
    expect(first.uriHash).not.toBe(second.uriHash)
  })

  it('changes the binding hash when the signed binding data changes', async () => {
    const binding = await buildBinding()
    const tampered = {
      ...binding,
      challenge: {
        ...binding.challenge,
        statement: binding.challenge.statement.replace('vault-identity', 'wallet-identity'),
      },
    }

    const originalHashes = buildPqcBindingHashes(binding)
    const tamperedHashes = buildPqcBindingHashes(tampered)

    expect(tamperedHashes.bindingHash).not.toBe(originalHashes.bindingHash)
    expect(tamperedHashes.statementHash).not.toBe(originalHashes.statementHash)
  })

  it('builds XRPL memo anchors that stay well under the memo size limit', async () => {
    const binding = await buildBinding()
    const hashes = buildPqcBindingHashes(
      binding,
      'https://app.example.com/api/public/pqc-bindings/example',
    )
    const memo = buildXrplPqcAnchorMemo(hashes)

    expect(memo.payloadBytesLength).toBeLessThan(1024)
    expect(memo.payload.bh).toMatch(/^0x[0-9a-f]{64}$/)
    expect(memo.payload.sg).toMatch(/^0x[0-9a-f]{64}$/)
    expect(memo.Memo.MemoType).toBe(Buffer.from('aljama:pqc-binding:v1', 'utf8').toString('hex').toUpperCase())
  })

  it('rejects unsupported PQC signature encodings when hashing bindings', async () => {
    const binding = await buildBinding()
    const malformed = {
      ...binding,
      proof: {
        ...binding.proof,
        signatureFormat: 'der-base64' as never,
      },
    }

    expect(() => buildPqcBindingHashes(malformed)).toThrow(/Unsupported PQC binding signature format/)
  })

  it('requires a URI hash before building XRPL anchor memos', async () => {
    const binding = await buildBinding()
    const hashes = buildPqcBindingHashes(binding)

    expect(() => buildXrplPqcAnchorMemo(hashes)).toThrow(/uriHash is required/)
  })
})
