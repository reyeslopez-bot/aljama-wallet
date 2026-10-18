import { describe, expect, it, vi } from 'vitest'
import type { Payment } from 'xrpl'
import { getXrplClient } from '@/infra/xrpl/client'
import { deriveLocalXrplWallet, createLocalXrplSigner } from '@/lib/xrpl/local-wallet'
import { signAndSubmitLocalXrplSwap } from '@/lib/xrpl/local-swap'

vi.mock('@/infra/xrpl/client', () => ({
  getXrplClient: vi.fn(),
}))

describe('local XRPL swap', () => {
  it('rejects a transaction that differs from the reviewed quote before connecting', async () => {
    const signer = createLocalXrplSigner(
      deriveLocalXrplWallet(
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
      ),
    )
    const asset = { currency: 'EURC', issuer: 'rIssuer', value: '8' }
    const transaction: Payment = {
      TransactionType: 'Payment',
      Account: signer.classicAddress,
      Destination: signer.classicAddress,
      Amount: asset,
      SendMax: '10000000',
      DeliverMin: { ...asset, value: '7' },
      Flags: 131072,
    }

    await expect(
      signAndSubmitLocalXrplSwap({
        networkId: 'testnet',
        signer,
        transaction,
        quote: {
          sourceAmount: { currency: 'XRP', value: '10' },
          destinationAmount: asset,
          deliverMin: { ...asset, value: '7.5' },
        },
      }),
    ).rejects.toThrow('reviewed quote')

    expect(getXrplClient).not.toHaveBeenCalled()
  })
})
