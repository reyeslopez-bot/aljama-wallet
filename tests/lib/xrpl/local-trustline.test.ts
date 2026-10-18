import { describe, expect, it, vi } from 'vitest'
import type { TrustSet } from 'xrpl'
import { getXrplClient } from '@/infra/xrpl/client'
import { createLocalXrplSigner, deriveLocalXrplWallet } from '@/lib/xrpl/local-wallet'
import { signAndSubmitLocalXrplTrustline } from '@/lib/xrpl/local-trustline'

vi.mock('@/infra/xrpl/client', () => ({
  getXrplClient: vi.fn(),
}))

describe('local XRPL trustline', () => {
  it('rejects a TrustSet that differs from the reviewed limit before connecting', async () => {
    const signer = createLocalXrplSigner(
      deriveLocalXrplWallet(
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
      ),
    )
    const transaction: TrustSet = {
      TransactionType: 'TrustSet',
      Account: signer.classicAddress,
      LimitAmount: {
        currency: 'EURC',
        issuer: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
        value: '100',
      },
    }

    await expect(
      signAndSubmitLocalXrplTrustline({
        networkId: 'testnet',
        signer,
        transaction,
        trustline: {
          currency: 'EURC',
          issuer: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
          limit: '50',
        },
      }),
    ).rejects.toThrow('review')

    expect(getXrplClient).not.toHaveBeenCalled()
  })
})
