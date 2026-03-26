import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('idempotency.service', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    vi.stubEnv('PG_DATABASE_URL', '')
    vi.stubEnv('POSTGRES_URL', '')

    const { resetIdempotencyState } = await import('@/services/idempotency.service')
    resetIdempotencyState()
  })

  it('allows the same key to be reserved again after it is released', async () => {
    const {
      releaseIdempotencyKey,
      reserveIdempotencyKey,
    } = await import('@/services/idempotency.service')

    await reserveIdempotencyKey({
      scope: 'wallet.send:wallet-1',
      key: '11111111-1111-4111-8111-111111111111',
    })

    await expect(
      reserveIdempotencyKey({
        scope: 'wallet.send:wallet-1',
        key: '11111111-1111-4111-8111-111111111111',
      }),
    ).rejects.toThrow('IDEMPOTENCY_REPLAY')

    await releaseIdempotencyKey({
      scope: 'wallet.send:wallet-1',
      key: '11111111-1111-4111-8111-111111111111',
    })

    await expect(
      reserveIdempotencyKey({
        scope: 'wallet.send:wallet-1',
        key: '11111111-1111-4111-8111-111111111111',
      }),
    ).resolves.toBeUndefined()
  })
})
