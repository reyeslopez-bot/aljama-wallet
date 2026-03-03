import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetWalletByPqcBindingHash } = vi.hoisted(() => ({
  mockGetWalletByPqcBindingHash: vi.fn(),
}))

vi.mock('@/services/wallet.service', () => ({
  getWalletByPqcBindingHash: mockGetWalletByPqcBindingHash,
}))

function buildContext(bindingHash: string) {
  return {
    params: Promise.resolve({ bindingHash }),
  }
}

describe('app/api/public/pqc-bindings/[bindingHash] route', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('returns 404 when the binding hash is unknown', async () => {
    mockGetWalletByPqcBindingHash.mockResolvedValue(null)
    const { GET } = await import('@/app/api/public/pqc-bindings/[bindingHash]/route')

    const res = await GET(new Request('http://localhost/api/public/pqc-bindings/hash'), buildContext('hash'))
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.code).toBe('binding_not_found')
  })

  it('returns the sanitized public binding payload', async () => {
    mockGetWalletByPqcBindingHash.mockResolvedValue({
      pqcBinding: {
        version: 1,
        role: 'vault-identity',
        scheme: 'ml-dsa-65',
        provider: 'noble',
        publicKey: 'cHVibGljLWtleQ==',
        publicKeyFormat: 'raw-base64',
        subject: {
          accountRef: 'EVM:secp256k1:0xabc',
          chain: 'EVM',
          address: '0xabc',
          keyType: 'secp256k1',
          scheme: 'ecdsa',
          publicKey: '0x04abcd',
          publicKeyFormat: 'hex',
        },
        challenge: {
          type: 'classical-key-binding',
          statement: '{"version":1}',
          statementFormat: 'utf8-json',
        },
        proof: {
          signature: 'c2ln',
          signatureFormat: 'raw-base64',
          attestedAt: '2026-03-03T00:00:00.000Z',
        },
      },
    })
    const { GET } = await import('@/app/api/public/pqc-bindings/[bindingHash]/route')

    const res = await GET(
      new Request('http://localhost/api/public/pqc-bindings/hash-1'),
      buildContext('hash-1'),
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.bindingHash).toBe('hash-1')
    expect(body.binding.publicKey).toBe('cHVibGljLWtleQ==')
    expect(body.binding.keyPair).toBeUndefined()
  })
})
