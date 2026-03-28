import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockGetXrplClient,
  mockReserveIdempotencyKey,
  mockResolveSigningAccount,
  mockSignXrplTransactionViaSignerService,
} = vi.hoisted(() => ({
  mockGetXrplClient: vi.fn(),
  mockReserveIdempotencyKey: vi.fn(),
  mockResolveSigningAccount: vi.fn(),
  mockSignXrplTransactionViaSignerService: vi.fn(),
}))

vi.mock('@/infra/xrpl/client', () => ({
  getXrplClient: mockGetXrplClient,
}))

vi.mock('@/services/idempotency.service', () => ({
  reserveIdempotencyKey: mockReserveIdempotencyKey,
}))

vi.mock('@/services/signer.service', () => ({
  resolveSigningAccount: mockResolveSigningAccount,
}))

vi.mock('@/services/signer-client.service', () => ({
  signXrplTransactionViaSignerService: mockSignXrplTransactionViaSignerService,
}))

function buildResolvedSigningAccount() {
  return {
    id: 'account-1',
    accountRef: 'XRPL:ed25519:pubkey',
    chain: 'XRPL' as const,
    address: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
    pubKey: 'EDPUBKEY',
    keyType: 'ed25519' as const,
    signerBackend: 'local' as const,
    vaultId: 'public' as const,
    derivationPath: null,
    policy: { requiresSecondFactor: false, requiresPQAttestation: false },
    pqcBinding: null,
    pqcBindingHash: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  }
}

describe('xrpl-tx-submit.service', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.useRealTimers()

    mockReserveIdempotencyKey.mockResolvedValue(undefined)
    mockResolveSigningAccount.mockResolvedValue(buildResolvedSigningAccount())
    mockSignXrplTransactionViaSignerService.mockResolvedValue({
      kind: 'xrpl-transaction',
      txBlob: 'SIGNED_BLOB',
      txHash: 'ABC123',
      publicKey: 'EDPUBKEY',
    })
  })

  it('retries transient XRPL submission failures and backs off by attempt', async () => {
    vi.useFakeTimers()

    const submitAndWait = vi
      .fn()
      .mockRejectedValueOnce(new Error('network timeout'))
      .mockResolvedValueOnce({ result: { validated: true } })

    mockGetXrplClient.mockResolvedValue({ submitAndWait })

    const { submitSignedXrplTx } = await import('@/services/xrpl-tx-submit.service')

    const resultPromise = submitSignedXrplTx({
      networkId: 'testnet',
      txBlob: 'SIGNED_BLOB',
      retries: 2,
    })

    await vi.runAllTimersAsync()

    await expect(resultPromise).resolves.toMatchObject({
      result: { validated: true },
    })
    expect(submitAndWait).toHaveBeenCalledTimes(2)
    expect(submitAndWait).toHaveBeenNthCalledWith(1, 'SIGNED_BLOB')
    expect(submitAndWait).toHaveBeenNthCalledWith(2, 'SIGNED_BLOB')
  })

  it('does not retry non-transient XRPL submission failures', async () => {
    const submitAndWait = vi.fn().mockRejectedValue(new Error('tefPAST_SEQ'))
    mockGetXrplClient.mockResolvedValue({ submitAndWait })

    const { submitSignedXrplTx } = await import('@/services/xrpl-tx-submit.service')

    await expect(
      submitSignedXrplTx({
        networkId: 'testnet',
        txBlob: 'SIGNED_BLOB',
        retries: 5,
      }),
    ).rejects.toThrow('tefPAST_SEQ')

    expect(submitAndWait).toHaveBeenCalledTimes(1)
  })

  it('submits a signed XRPL transaction and parses sequence, ledger index, and meta result', async () => {
    const autofill = vi.fn().mockResolvedValue({
      TransactionType: 'Payment',
      Account: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
      Destination: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
      Amount: '1000',
      Sequence: '12',
    })
    const submitAndWait = vi.fn().mockResolvedValue({
      result: {
        validated: true,
        ledger_index: '456',
        meta: {
          TransactionResult: 'tesSUCCESS',
        },
      },
    })

    mockGetXrplClient.mockResolvedValue({
      autofill,
      submitAndWait,
    })

    const { submitXrplTx } = await import('@/services/xrpl-tx-submit.service')

    const result = await submitXrplTx({
      scope: 'xrpl.trade.swap:rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
      idempotencyKey: '11111111-1111-4111-8111-111111111111',
      networkId: 'testnet',
      tx: {
        TransactionType: 'Payment',
        Destination: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
        Amount: '1000',
      } as any,
    })

    expect(mockReserveIdempotencyKey).toHaveBeenCalledWith({
      scope: 'xrpl.trade.swap:rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
      key: '11111111-1111-4111-8111-111111111111',
      ttlMs: 600000,
    })
    expect(autofill).toHaveBeenCalledWith(
      expect.objectContaining({
        Account: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
        SigningPubKey: 'EDPUBKEY',
        Destination: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
      }),
    )
    expect(result).toMatchObject({
      account: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
      accountRef: 'XRPL:ed25519:pubkey',
      keyType: 'ed25519',
      networkId: 'testnet',
      txHash: 'ABC123',
      txBlob: 'SIGNED_BLOB',
      engineResult: 'tesSUCCESS',
      validated: true,
      ledgerIndex: 456,
      sequence: 12,
    })
  })

  it('falls back to engine_result when XRPL metadata is missing', async () => {
    const autofill = vi.fn().mockResolvedValue({
      TransactionType: 'Payment',
      Account: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
      Destination: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
      Amount: '1000',
      Sequence: 8,
    })
    const submitAndWait = vi.fn().mockResolvedValue({
      result: {
        validated: false,
        ledger_index: null,
        meta: 'unavailable',
        engine_result: 'terQUEUED',
      },
    })

    mockGetXrplClient.mockResolvedValue({
      autofill,
      submitAndWait,
    })

    const { submitXrplTx } = await import('@/services/xrpl-tx-submit.service')

    const result = await submitXrplTx({
      scope: 'xrpl.trade.offer:rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
      idempotencyKey: '22222222-2222-4222-8222-222222222222',
      networkId: 'testnet',
      tx: {
        TransactionType: 'Payment',
        Destination: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
        Amount: '1000',
      } as any,
    })

    expect(result.engineResult).toBe('terQUEUED')
    expect(result.ledgerIndex).toBeNull()
    expect(result.sequence).toBe(8)
  })
})
