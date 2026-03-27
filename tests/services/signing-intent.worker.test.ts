import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockSignUnsignedEvmTx,
  mockDeriveSignedEvmTxHash,
  mockSubmitSignedEvmTx,
  mockUpdateTransferStatus,
  mockGetWalletByChainAddress,
  mockRecordChainTransaction,
  mockMarkReplacedTransferAttempts,
  mockMarkNonceReservationSubmitted,
  mockMarkNonceReservationFailed,
  mockReleaseNonceReservation,
  mockGetEvmProviderForChain,
  mockLogError,
  mockLogInfo,
  mockLogWarn,
  mockObserveWalletChainRpcIssue,
} = vi.hoisted(() => ({
  mockSignUnsignedEvmTx: vi.fn(),
  mockDeriveSignedEvmTxHash: vi.fn(),
  mockSubmitSignedEvmTx: vi.fn(),
  mockUpdateTransferStatus: vi.fn(),
  mockGetWalletByChainAddress: vi.fn(),
  mockRecordChainTransaction: vi.fn(),
  mockMarkReplacedTransferAttempts: vi.fn(),
  mockMarkNonceReservationSubmitted: vi.fn(),
  mockMarkNonceReservationFailed: vi.fn(),
  mockReleaseNonceReservation: vi.fn(),
  mockGetEvmProviderForChain: vi.fn(),
  mockLogError: vi.fn(),
  mockLogInfo: vi.fn(),
  mockLogWarn: vi.fn(),
  mockObserveWalletChainRpcIssue: vi.fn(),
}))

vi.mock('@/services/evm-tx.service', () => ({
  signUnsignedEvmTx: mockSignUnsignedEvmTx,
  deriveSignedEvmTxHash: mockDeriveSignedEvmTxHash,
  submitSignedEvmTx: mockSubmitSignedEvmTx,
}))

vi.mock('@/services/transfer-log.service', () => ({
  updateTransferStatus: mockUpdateTransferStatus,
}))

vi.mock('@/services/wallet.service', () => ({
  getWalletByChainAddress: mockGetWalletByChainAddress,
  recordChainTransaction: mockRecordChainTransaction,
}))

vi.mock('@/services/chain-transaction-sync.service', () => ({
  markReplacedTransferAttempts: mockMarkReplacedTransferAttempts,
}))

vi.mock('@/services/nonce-reservation.service', () => ({
  markNonceReservationSubmitted: mockMarkNonceReservationSubmitted,
  markNonceReservationFailed: mockMarkNonceReservationFailed,
  releaseNonceReservation: mockReleaseNonceReservation,
}))

vi.mock('@/lib/security/logging', () => ({
  logError: mockLogError,
  logInfo: mockLogInfo,
  logWarn: mockLogWarn,
}))

vi.mock('@/lib/evm-rpc', () => ({
  getEvmProviderForChain: mockGetEvmProviderForChain,
}))

vi.mock('@/services/wallet-chain-observability.service', () => ({
  observeWalletChainRpcIssue: mockObserveWalletChainRpcIssue,
}))

vi.mock('ethers', () => ({
  JsonRpcProvider: class MockJsonRpcProvider {},
}))

describe('signing-intent.worker', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    vi.stubEnv('EVM_RPC_URL', 'https://rpc.example')

    const { resetWalletSigningIntentState } = await import('@/services/signing-intent.service')
    resetWalletSigningIntentState()

    mockDeriveSignedEvmTxHash.mockReturnValue('0xderived')
    mockSubmitSignedEvmTx.mockResolvedValue('0xtxhash')
    mockGetWalletByChainAddress.mockResolvedValue(null)
    mockRecordChainTransaction.mockResolvedValue({
      record: { id: 'chain-1' },
      replacedTxHashes: [],
    })
    mockGetEvmProviderForChain.mockImplementation(async (chainId: number) => ({ chainId }))
    mockMarkReplacedTransferAttempts.mockResolvedValue(undefined)
    mockMarkNonceReservationSubmitted.mockResolvedValue(undefined)
    mockMarkNonceReservationFailed.mockResolvedValue(undefined)
    mockReleaseNonceReservation.mockResolvedValue(undefined)
    mockUpdateTransferStatus.mockResolvedValue(undefined)
    mockObserveWalletChainRpcIssue.mockResolvedValue(undefined)
  })

  it('signs, broadcasts, and records a queued wallet signing intent', async () => {
    mockSignUnsignedEvmTx.mockResolvedValue('0xsigned')

    const {
      buildEvmTransactionSigningIntentPayload,
      createWalletSigningIntent,
      getWalletSigningIntent,
    } = await import('@/services/signing-intent.service')
    const { processWalletSigningIntentQueuePass } = await import('@/services/signing-intent.worker')

    const created = await createWalletSigningIntent({
      walletId: 'wallet-1',
      userId: 'user-1',
      chainId: 8453,
      idempotencyKey: '11111111-1111-4111-8111-111111111111',
      correlationId: '22222222-2222-4222-8222-222222222222',
      transferLogId: 'log-1',
      payload: buildEvmTransactionSigningIntentPayload({
        walletId: 'wallet-1',
        chainId: 8453,
        nonceReservationId: 'nonce-1',
        fromAddress: '0x000000000000000000000000000000000000beef',
        toAddress: '0x000000000000000000000000000000000000dead',
        amountWei: '1000000000000000',
        txType: 'transfer',
        transferLogId: 'log-1',
        transaction: {
          to: '0x000000000000000000000000000000000000dead',
          nonce: 7,
          gasLimit: 21_000n,
          maxFeePerGas: 2n,
          maxPriorityFeePerGas: 1n,
        },
      }),
    })

    const result = await processWalletSigningIntentQueuePass({ batchSize: 5 })
    const intent = await getWalletSigningIntent(created.id)

    expect(result).toEqual({
      processedCount: 1,
      succeededCount: 1,
      failedCount: 0,
    })
    expect(intent).toMatchObject({
      id: created.id,
      status: 'submitted',
      txHash: '0xtxhash',
      signedPayload: '0xsigned',
    })
    expect(mockSignUnsignedEvmTx).toHaveBeenCalledWith(
      'wallet-1',
      8453,
      expect.objectContaining({
        to: '0x000000000000000000000000000000000000dead',
        nonce: 7,
      }),
    )
    expect(mockGetEvmProviderForChain).toHaveBeenCalledWith(8453)
    expect(mockUpdateTransferStatus).toHaveBeenCalledWith('log-1', 'submitted', {
      txHash: '0xtxhash',
      nonce: '7',
      txType: 'transfer',
      data: null,
      gasLimit: '21000',
      gasPrice: null,
      maxFeePerGas: '2',
      maxPriorityFeePerGas: '1',
      replacesTxHash: undefined,
    })
    expect(mockRecordChainTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        chainId: 8453,
        txHash: '0xtxhash',
        fromWalletId: 'wallet-1',
        fromAddress: '0x000000000000000000000000000000000000beef',
        toAddress: '0x000000000000000000000000000000000000dead',
        valueBaseUnits: 1000000000000000n,
        status: 'submitted',
        txType: 'transfer',
        nonce: 7,
      }),
    )
    expect(mockMarkNonceReservationSubmitted).toHaveBeenCalledWith('nonce-1', '0xtxhash')
    expect(mockLogInfo).toHaveBeenCalledWith(
      'wallet-signing-intent-worker:pass',
      'Processed signing intent',
      expect.objectContaining({
        intentId: created.id,
        traceId: '22222222-2222-4222-8222-222222222222',
      }),
    )
  })

  it('marks the intent failed when signing fails', async () => {
    mockSignUnsignedEvmTx.mockRejectedValue(new Error('INTERNAL_SIGNER_UNAVAILABLE'))

    const {
      buildEvmTransactionSigningIntentPayload,
      createWalletSigningIntent,
      getWalletSigningIntent,
    } = await import('@/services/signing-intent.service')
    const { processWalletSigningIntentQueuePass } = await import('@/services/signing-intent.worker')

    const created = await createWalletSigningIntent({
      walletId: 'wallet-1',
      userId: 'user-1',
      chainId: 8453,
      idempotencyKey: '11111111-1111-4111-8111-111111111111',
      correlationId: '22222222-2222-4222-8222-222222222222',
      transferLogId: 'log-1',
      payload: buildEvmTransactionSigningIntentPayload({
        walletId: 'wallet-1',
        chainId: 8453,
        nonceReservationId: 'nonce-1',
        fromAddress: '0x000000000000000000000000000000000000beef',
        toAddress: '0x000000000000000000000000000000000000dead',
        amountWei: '1000000000000000',
        txType: 'transfer',
        transferLogId: 'log-1',
        transaction: {
          to: '0x000000000000000000000000000000000000dead',
          nonce: 7,
        },
      }),
    })

    const result = await processWalletSigningIntentQueuePass({ batchSize: 5 })
    const intent = await getWalletSigningIntent(created.id)

    expect(result).toEqual({
      processedCount: 1,
      succeededCount: 0,
      failedCount: 1,
    })
    expect(intent).toMatchObject({
      id: created.id,
      status: 'failed',
      errorCode: 'INTERNAL_SIGNER_UNAVAILABLE',
    })
    expect(mockUpdateTransferStatus).toHaveBeenCalledWith('log-1', 'failed', {
      txHash: undefined,
      nonce: '7',
      txType: 'transfer',
      data: null,
      gasLimit: null,
      gasPrice: null,
      maxFeePerGas: null,
      maxPriorityFeePerGas: null,
    })
    expect(mockReleaseNonceReservation).toHaveBeenCalledWith('nonce-1')
    expect(mockLogError).toHaveBeenCalledWith(
      'wallet-signing-intent-worker:pass',
      expect.any(Error),
      expect.objectContaining({
        intentId: created.id,
        traceId: '22222222-2222-4222-8222-222222222222',
      }),
    )
  })

  it('observes chain RPC issues when provider resolution fails', async () => {
    mockGetEvmProviderForChain.mockRejectedValue(new Error('rpc unavailable'))

    const {
      buildEvmTransactionSigningIntentPayload,
      createWalletSigningIntent,
      getWalletSigningIntent,
    } = await import('@/services/signing-intent.service')
    const { processWalletSigningIntentQueuePass } = await import('@/services/signing-intent.worker')

    const created = await createWalletSigningIntent({
      walletId: 'wallet-1',
      userId: 'user-1',
      chainId: 8453,
      idempotencyKey: '11111111-1111-4111-8111-111111111111',
      correlationId: '22222222-2222-4222-8222-222222222222',
      transferLogId: 'log-1',
      payload: buildEvmTransactionSigningIntentPayload({
        walletId: 'wallet-1',
        chainId: 8453,
        nonceReservationId: 'nonce-1',
        fromAddress: '0x000000000000000000000000000000000000beef',
        toAddress: '0x000000000000000000000000000000000000dead',
        amountWei: '1000000000000000',
        txType: 'transfer',
        transferLogId: 'log-1',
        transaction: {
          to: '0x000000000000000000000000000000000000dead',
          nonce: 7,
        },
      }),
    })

    await processWalletSigningIntentQueuePass({ batchSize: 5 })
    const intent = await getWalletSigningIntent(created.id)

    expect(intent?.status).toBe('failed')
    expect(mockObserveWalletChainRpcIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'wallet-signing-intent-worker',
        walletId: 'wallet-1',
        chainId: 8453,
        details: expect.objectContaining({
          intentId: created.id,
        }),
      }),
    )
  })
})
