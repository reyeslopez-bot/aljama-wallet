import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockRecordTelemetryEvent,
  mockEmitSecurityAlert,
  mockLogError,
  mockLogWarn,
} = vi.hoisted(() => ({
  mockRecordTelemetryEvent: vi.fn(),
  mockEmitSecurityAlert: vi.fn(),
  mockLogError: vi.fn(),
  mockLogWarn: vi.fn(),
}))

vi.mock('@/services/telemetry.service', () => ({
  recordTelemetryEvent: mockRecordTelemetryEvent,
}))

vi.mock('@/services/security-alert.service', () => ({
  emitSecurityAlert: mockEmitSecurityAlert,
}))

vi.mock('@/lib/security/logging', () => ({
  logError: mockLogError,
  logWarn: mockLogWarn,
}))

describe('wallet-chain-observability.service', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.unstubAllEnvs()

    mockRecordTelemetryEvent.mockResolvedValue({ stored: 'memory' })
    mockEmitSecurityAlert.mockResolvedValue({ id: 'alert-1' })
  })

  it('records telemetry and emits alerts for unavailable configured RPC chains', async () => {
    const { EvmRpcChainUnavailableError } = await import('@/lib/evm-rpc')
    const { observeWalletChainRpcIssue } = await import('@/services/wallet-chain-observability.service')

    await observeWalletChainRpcIssue({
      scope: 'wallet-send',
      requestId: 'req-1',
      traceId: 'trace-1',
      correlationId: 'trace-1',
      walletId: 'wallet-1',
      chainId: 8453,
      error: new EvmRpcChainUnavailableError(8453),
    })

    expect(mockLogWarn).toHaveBeenCalledWith(
      'wallet-send:observability',
      expect.any(EvmRpcChainUnavailableError),
      expect.objectContaining({
        issue: 'rpc_unavailable',
        chainId: 8453,
        walletId: 'wallet-1',
      }),
    )
    expect(mockRecordTelemetryEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'wallet_chain_rpc_issue',
        sessionId: 'server:wallet-send-route',
        deviceId: 'chain:8453',
        traceId: 'trace-1',
        path: '/api/wallet/send',
        context: expect.objectContaining({
          scope: 'wallet-send',
          issue: 'rpc_unavailable',
          chainId: 8453,
          walletId: 'wallet-1',
        }),
        payload: expect.objectContaining({
          count: 1,
          expectedChainId: 8453,
          requestedChainId: 8453,
        }),
      }),
    )
    expect(mockEmitSecurityAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        ruleId: 'wallet.evm_rpc.unavailable',
        source: 'api.wallet-send',
        fingerprint: 'rpc-unavailable:8453',
      }),
    )
  })

  it('records mismatch telemetry with the resolved chain id', async () => {
    const { EvmRpcChainMismatchError } = await import('@/lib/evm-rpc')
    const { observeWalletChainRpcIssue } = await import('@/services/wallet-chain-observability.service')

    await observeWalletChainRpcIssue({
      scope: 'wallet-pqc-anchor',
      walletId: 'wallet-1',
      chainId: 8453,
      error: new EvmRpcChainMismatchError(8453, 1),
    })

    expect(mockLogError).toHaveBeenCalledWith(
      'wallet-pqc-anchor:observability',
      expect.any(EvmRpcChainMismatchError),
      expect.objectContaining({
        issue: 'chain_mismatch',
        chainId: 8453,
        actualChainId: 1,
      }),
    )
    expect(mockRecordTelemetryEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          expectedChainId: 8453,
          actualChainId: 1,
        }),
      }),
    )
    expect(mockEmitSecurityAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        ruleId: 'wallet.evm_rpc.chain_mismatch',
        fingerprint: 'rpc-chain-mismatch:8453:1',
      }),
    )
  })

  it('emits sync failure telemetry and alert once the threshold is met', async () => {
    vi.stubEnv('CHAIN_TRANSACTION_SYNC_FAILURE_ALERT_MIN_COUNT', '2')

    const { observeWalletChainSyncFailures } = await import('@/services/wallet-chain-observability.service')

    await observeWalletChainSyncFailures({
      chainId: 8453,
      networkId: '8453',
      failedCount: 2,
      details: {
        rowCount: 5,
        sampleTxHashes: ['0xtx-1', '0xtx-2'],
      },
      error: new Error('write failed'),
    })

    expect(mockLogError).toHaveBeenCalledWith(
      'chain-tx-sync:observability',
      expect.any(Error),
      expect.objectContaining({
        issue: 'sync_failed',
        chainId: 8453,
        count: 2,
      }),
    )
    expect(mockRecordTelemetryEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'wallet_chain_sync_failure',
        sessionId: 'server:chain-tx-sync-worker',
        deviceId: 'chain:8453',
        context: expect.objectContaining({
          scope: 'chain-tx-sync',
          issue: 'sync_failed',
          chainId: 8453,
        }),
        payload: expect.objectContaining({
          count: 2,
          rowCount: 5,
          sampleTxHashes: ['0xtx-1', '0xtx-2'],
        }),
      }),
    )
    expect(mockEmitSecurityAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        ruleId: 'wallet.chain_transaction.sync_failures',
        fingerprint: 'chain-tx-sync-failures:8453',
      }),
    )
  })
})
