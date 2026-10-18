import { describe, expect, it } from 'vitest'
import { decode } from 'xrpl'
import { encodeWalletToEncrypted } from '@/lib/wallet'
import {
  createLocalXrplSigner,
  deriveLocalXrplWallet,
  unlockLocalXrplSigner,
} from '@/lib/xrpl/local-wallet'

describe('local XRPL wallet', () => {
  it('derives signing material that matches the displayed XRPL address', () => {
    const material = deriveLocalXrplWallet(
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
    )

    expect(material.address).toMatch(/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/)
    expect(material.publicKey).toMatch(/^ED[A-F0-9]{64}$/)
    expect(material.privateKey).toMatch(/^ED[A-F0-9]{64}$/)
    expect(createLocalXrplSigner(material).classicAddress).toBe(material.address)
  })

  it('rejects signing material whose public key does not match the address', () => {
    const material = deriveLocalXrplWallet(
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
    )

    expect(() => createLocalXrplSigner({ ...material, address: 'rInvalid' })).toThrow(
      'XRPL wallet material does not match its address',
    )
  })

  it('signs a payment with the locally derived XRPL key', () => {
    const signer = createLocalXrplSigner(
      deriveLocalXrplWallet(
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
      ),
    )

    const signed = signer.sign({
      TransactionType: 'Payment',
      Account: signer.classicAddress,
      Destination: signer.classicAddress,
      Amount: '1',
      Fee: '12',
      Sequence: 1,
      LastLedgerSequence: 100,
    })
    const decoded = decode(signed.tx_blob)

    expect(decoded.Account).toBe(signer.classicAddress)
    expect(decoded.TxnSignature).toBeTruthy()
    expect(signed.hash).toMatch(/^[A-F0-9]{64}$/)
  })

  it('unlocks XRPL signing material only from the encrypted local wallet', async () => {
    const material = deriveLocalXrplWallet(
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
    )
    const encrypted = await encodeWalletToEncrypted(
      {
        address: '0x1111111111111111111111111111111111111111',
        privateKey: `0x${'1'.repeat(64)}`,
      },
      'StrongPassphrase1!',
      { xrplWallet: material },
    )

    const signer = await unlockLocalXrplSigner({
      encrypted,
      password: 'StrongPassphrase1!',
    })

    expect(signer.classicAddress).toBe(material.address)
  })
})
