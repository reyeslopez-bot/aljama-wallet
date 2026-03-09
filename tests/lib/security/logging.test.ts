import { beforeEach, describe, expect, it, vi } from 'vitest'
import { logError, logInfo, logWarn } from '@/lib/security/logging'

describe('security logging', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('normalizes errors into structured payloads', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const cause = new Error('root cause')
    const error = new Error('top level failure', { cause }) as Error & { code?: string; requestId?: string }
    error.name = 'CustomFailure'
    error.code = 'E_TOP'
    error.requestId = 'req-123'

    logError('test:logger', error, { operation: 'persist', attempt: 2 })

    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(String(errorSpy.mock.calls[0]?.[0])).toContain('[test:logger] top level failure')
    expect(errorSpy.mock.calls[0]?.[1]).toMatchObject({
      level: 'error',
      scope: 'test:logger',
      operation: 'persist',
      attempt: 2,
      error: {
        name: 'CustomFailure',
        message: 'top level failure',
        code: 'E_TOP',
        cause: {
          name: 'Error',
          message: 'root cause',
        },
        context: {
          requestId: 'req-123',
        },
      },
    })
    expect(typeof errorSpy.mock.calls[0]?.[1]?.timestamp).toBe('string')
  })

  it('keeps warning payloads readable for non-Error objects', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    logWarn(
      'test:logger',
      {
        message: 'validation failed',
        code: 'VALIDATION_FAILED',
        issues: [{ path: ['event'], message: 'Required' }],
      },
      { requestId: 'req-456' },
    )

    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain('[test:logger] validation failed')
    expect(warnSpy.mock.calls[0]?.[1]).toMatchObject({
      level: 'warn',
      scope: 'test:logger',
      requestId: 'req-456',
      error: {
        name: 'ErrorLike',
        message: 'validation failed',
        code: 'VALIDATION_FAILED',
        context: {
          issues: [{ path: ['event'], message: 'Required' }],
        },
      },
    })
  })

  it('adds shared metadata to info logs', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})

    logInfo('test:logger', 'Socket connected', {
      walletId: 'wallet-1',
      socketUrl: 'wss://example.test/ws',
    })

    expect(infoSpy).toHaveBeenCalledTimes(1)
    expect(String(infoSpy.mock.calls[0]?.[0])).toContain('[test:logger] Socket connected')
    expect(infoSpy.mock.calls[0]?.[1]).toMatchObject({
      level: 'info',
      scope: 'test:logger',
      walletId: 'wallet-1',
      socketUrl: 'wss://example.test/ws',
    })
    expect(typeof infoSpy.mock.calls[0]?.[1]?.timestamp).toBe('string')
  })
})
