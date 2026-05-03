import { describe, it, expect } from 'vitest'
import { makeIdempotencyKey } from '@/lib/idempotency'

describe('makeIdempotencyKey', () => {
  it('returns a string', () => {
    expect(typeof makeIdempotencyKey()).toBe('string')
  })

  it('returns a non-empty string', () => {
    expect(makeIdempotencyKey().length).toBeGreaterThan(0)
  })

  it('returns a UUID-shaped string when crypto.randomUUID is available', () => {
    const key = makeIdempotencyKey()
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  })

  it('produces unique keys on repeated calls', () => {
    const keys = new Set(Array.from({ length: 20 }, () => makeIdempotencyKey()))
    expect(keys.size).toBe(20)
  })

  it('falls back to timestamp-based UUID when crypto.randomUUID is unavailable', () => {
    const originalRandomUUID = globalThis.crypto?.randomUUID

    try {
      Object.defineProperty(globalThis.crypto, 'randomUUID', {
        value: undefined,
        configurable: true,
        writable: true,
      })

      const key = makeIdempotencyKey()
      expect(typeof key).toBe('string')
      expect(key.length).toBeGreaterThan(0)
      expect(key).toContain('-')
    } finally {
      if (originalRandomUUID !== undefined) {
        Object.defineProperty(globalThis.crypto, 'randomUUID', {
          value: originalRandomUUID,
          configurable: true,
          writable: true,
        })
      }
    }
  })
})
