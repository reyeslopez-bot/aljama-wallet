import { beforeEach, describe, expect, it, vi } from 'vitest'
import { walletTopicsV1 } from '@/infra/agentic/kafka'

const providerSend = vi.fn()
const getEvmProviderForChain = vi.fn()
const observeWalletChainRpcIssue = vi.fn()
const consumerConnect = vi.fn()
const consumerSubscribe = vi.fn()
const consumerRun = vi.fn()
const producerConnect = vi.fn()
const producerSend = vi.fn()

vi.mock('@/infra/kafka', () => ({
  createConsumer: vi.fn(() => ({
    connect: consumerConnect,
    subscribe: consumerSubscribe,
    run: consumerRun,
  })),
  createProducer: vi.fn(() => ({
    connect: producerConnect,
    send: producerSend,
  })),
}))

vi.mock('@/lib/evm-rpc', () => ({
  getEvmProviderForChain,
}))

vi.mock('@/services/wallet-chain-observability.service', () => ({
  observeWalletChainRpcIssue,
}))

const signedEvent = {
  topic: walletTopicsV1.signed,
  correlationId: '6c2eb269-3c89-4fe7-b8fe-b6d4ff9c64dc',
  idempotencyKey: '1fb2e32d-c3c0-4bc7-a62a-f710bcf68707',
  chainId: 11155111,
  walletId: 'wallet-1',
  signedTx: '0xsigned',
  txHash: '0xprecomputed',
  createdAt: '2026-03-09T10:00:00.000Z',
}

describe('broadcaster.service', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.unstubAllEnvs()

    getEvmProviderForChain.mockResolvedValue({ send: providerSend })
    observeWalletChainRpcIssue.mockResolvedValue(undefined)
    consumerConnect.mockResolvedValue(undefined)
    consumerSubscribe.mockResolvedValue(undefined)
    producerConnect.mockResolvedValue(undefined)
    producerSend.mockResolvedValue(undefined)
  })

  it('logs pipeline stages and publishes broadcast events', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    providerSend.mockResolvedValue('0xpublished')
    consumerRun.mockImplementation(async ({ eachMessage }: { eachMessage: (payload: { message: { key?: Buffer; value?: Buffer } }) => Promise<void> }) => {
      await eachMessage({
        message: {
          key: Buffer.from(signedEvent.correlationId),
          value: Buffer.from(JSON.stringify(signedEvent)),
        },
      })
    })

    const { startBroadcaster } = await import('@/services/broadcaster.service')
    await startBroadcaster()

    expect(consumerConnect).toHaveBeenCalledTimes(1)
    expect(producerConnect).toHaveBeenCalledTimes(1)
    expect(consumerSubscribe).toHaveBeenCalledWith({ topic: walletTopicsV1.signed })
    expect(getEvmProviderForChain).toHaveBeenCalledWith(signedEvent.chainId)
    expect(providerSend).toHaveBeenCalledWith('eth_sendRawTransaction', [signedEvent.signedTx])
    expect(producerSend).toHaveBeenCalledWith({
      topic: walletTopicsV1.broadcast,
      messages: [
        {
          key: signedEvent.correlationId,
          value: expect.any(String),
        },
      ],
    })
    expect(
      infoSpy.mock.calls.some((call) =>
        String(call[0]).includes('[broadcaster] Starting wallet broadcaster'),
      ),
    ).toBe(true)
    expect(
      infoSpy.mock.calls.some((call) =>
        String(call[0]).includes('[broadcaster:message] Published wallet broadcast event'),
      ),
    ).toBe(true)
    expect(
      infoSpy.mock.calls.find((call) =>
        String(call[0]).includes('[broadcaster:message] Published wallet broadcast event'),
      )?.[1],
    ).toMatchObject({
      correlationId: signedEvent.correlationId,
      chainId: signedEvent.chainId,
      txHash: '0xpublished',
    })
  })

  it('logs message-processing failures with Kafka context', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    consumerRun.mockImplementation(async ({ eachMessage }: { eachMessage: (payload: { message: { key?: Buffer; value?: Buffer } }) => Promise<void> }) => {
      await eachMessage({
        message: {
          key: Buffer.from('bad-message-key'),
          value: Buffer.from('not-json'),
        },
      })
    })

    const { startBroadcaster } = await import('@/services/broadcaster.service')

    await expect(startBroadcaster()).rejects.toThrow()
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(String(errorSpy.mock.calls[0]?.[0])).toContain('[broadcaster:message]')
    expect(errorSpy.mock.calls[0]?.[1]).toMatchObject({
      groupId: 'wallet-broadcaster',
      topic: walletTopicsV1.signed,
      messageKey: 'bad-message-key',
      messageBytes: 8,
      error: {
        name: 'SyntaxError',
      },
    })
  })

  it('records chain-aware RPC observability when broadcast submission fails', async () => {
    providerSend.mockRejectedValue(new Error('upstream rpc timeout'))
    consumerRun.mockImplementation(async ({ eachMessage }: { eachMessage: (payload: { message: { key?: Buffer; value?: Buffer } }) => Promise<void> }) => {
      await eachMessage({
        message: {
          key: Buffer.from(signedEvent.correlationId),
          value: Buffer.from(JSON.stringify(signedEvent)),
        },
      })
    })

    const { startBroadcaster } = await import('@/services/broadcaster.service')

    await expect(startBroadcaster()).rejects.toThrow('upstream rpc timeout')
    expect(observeWalletChainRpcIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'broadcaster',
        chainId: signedEvent.chainId,
        correlationId: signedEvent.correlationId,
        walletId: signedEvent.walletId,
        details: expect.objectContaining({
          operation: 'eth_sendRawTransaction',
        }),
      }),
    )
  })
})
