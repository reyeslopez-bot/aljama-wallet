import os from 'node:os'
import path from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('signing-intent.service', () => {
  let archiveDir: string | null = null

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.unstubAllEnvs()

    archiveDir = await mkdtemp(path.join(os.tmpdir(), 'aljama-signing-intents-'))
    vi.stubEnv('PG_DATABASE_URL', '')
    vi.stubEnv('POSTGRES_URL', '')
    vi.stubEnv('WALLET_SIGNING_INTENT_ARCHIVE_DIR', archiveDir)
    vi.stubEnv('WALLET_SIGNING_INTENT_INLINE_PAYLOAD_MAX_BYTES', '128')
    vi.stubEnv('WALLET_SIGNING_INTENT_INLINE_PAYLOAD_HOT_WINDOW_MS', '3600000')

    const { resetWalletSigningIntentState } = await import('@/services/signing-intent.service')
    resetWalletSigningIntentState()
  })

  afterEach(async () => {
    vi.unstubAllEnvs()
    if (archiveDir) {
      await rm(archiveDir, { recursive: true, force: true })
      archiveDir = null
    }
  })

  it('archives oversized queued payloads and resolves them when claimed', async () => {
    const {
      buildEvmTransactionSigningIntentPayload,
      claimNextQueuedWalletSigningIntent,
      createWalletSigningIntent,
      getWalletSigningIntent,
    } = await import('@/services/signing-intent.service')

    const payload = buildEvmTransactionSigningIntentPayload({
      walletId: 'wallet-1',
      chainId: 8453,
      nonceReservationId: 'nonce-1',
      fromAddress: '0x000000000000000000000000000000000000beef',
      toAddress: '0x000000000000000000000000000000000000dead',
      amountWei: '1000000000000000',
      txType: 'contract_call',
      data: `0x${'ab'.repeat(512)}`,
      transferLogId: 'log-1',
      transaction: {
        to: '0x000000000000000000000000000000000000dead',
        nonce: 7,
        gasLimit: 75_000n,
        maxFeePerGas: 2n,
        maxPriorityFeePerGas: 1n,
        data: `0x${'ab'.repeat(512)}`,
      },
    })

    const created = await createWalletSigningIntent({
      walletId: 'wallet-1',
      userId: 'user-1',
      chainId: 8453,
      idempotencyKey: '11111111-1111-4111-8111-111111111111',
      correlationId: '22222222-2222-4222-8222-222222222222',
      transferLogId: 'log-1',
      payload,
    })

    expect(created.payloadStorage).toBe('archived')
    expect(created.payloadRef).toMatch(/^file:/)
    expect(created.payloadSizeBytes).toBeGreaterThan(128)
    expect(created.payload).toEqual(payload)

    const claimed = await claimNextQueuedWalletSigningIntent()
    expect(claimed).toMatchObject({
      id: created.id,
      status: 'approved',
      payloadStorage: 'archived',
    })
    expect(claimed?.payload).toEqual(payload)

    const reloaded = await getWalletSigningIntent(created.id)
    expect(reloaded?.payload).toEqual(payload)
    expect(reloaded?.payloadRef).toBe(created.payloadRef)
  })
})
