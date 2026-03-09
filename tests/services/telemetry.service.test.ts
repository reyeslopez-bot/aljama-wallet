import { beforeEach, describe, expect, it, vi } from 'vitest'

const createMock = vi.fn()

vi.mock('@/lib/prisma-pg', () => ({
  prismaPg: {
    telemetryEvent: {
      create: createMock,
    },
  },
}))

describe('telemetry.service', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  it('stores telemetry in Postgres when the DB write completes in time', async () => {
    vi.stubEnv('PG_DATABASE_URL', 'postgres://example')
    vi.stubEnv('TELEMETRY_STORAGE_MODE', 'db')
    createMock.mockResolvedValue({ id: 'telemetry-1' })

    const { getTelemetryEvents, recordTelemetryEvent } = await import('@/services/telemetry.service')
    const result = await recordTelemetryEvent({
      event: 'page_view',
      sessionId: 'session-1',
      deviceId: 'device-1',
      path: '/en',
    })

    expect(result).toEqual({ stored: 'db' })
    expect(createMock).toHaveBeenCalledTimes(1)
    expect(getTelemetryEvents()).toHaveLength(0)
  })

  it('falls back to memory when the DB write rejects', async () => {
    vi.stubEnv('PG_DATABASE_URL', 'postgres://example')
    vi.stubEnv('TELEMETRY_STORAGE_MODE', 'db')
    createMock.mockRejectedValue(new Error('db unavailable'))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { getTelemetryEvents, recordTelemetryEvent } = await import('@/services/telemetry.service')
    const result = await recordTelemetryEvent({
      event: 'page_view',
      sessionId: 'session-2',
      deviceId: 'device-2',
      path: '/en/login',
    })

    expect(result).toEqual({ stored: 'memory' })
    expect(getTelemetryEvents()[0]).toMatchObject({
      event: 'page_view',
      sessionId: 'session-2',
      deviceId: 'device-2',
      path: '/en/login',
    })
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain('[telemetry] db unavailable')
    expect(warnSpy.mock.calls[0]?.[1]).toMatchObject({
      event: 'page_view',
      sessionId: 'session-2',
      deviceId: 'device-2',
      path: '/en/login',
      fallbackReason: 'db_error',
      storage: 'db',
      fallback: 'memory',
      error: {
        message: 'db unavailable',
      },
    })
  })

  it('falls back to memory when the DB write exceeds the telemetry timeout', async () => {
    vi.stubEnv('PG_DATABASE_URL', 'postgres://example')
    vi.stubEnv('TELEMETRY_STORAGE_MODE', 'db')
    vi.stubEnv('TELEMETRY_DB_TIMEOUT_MS', '1')
    createMock.mockImplementation(() => new Promise(() => {}))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { getTelemetryEvents, recordTelemetryEvent } = await import('@/services/telemetry.service')
    const result = await recordTelemetryEvent({
      event: 'click',
      sessionId: 'session-3',
      deviceId: 'device-3',
      path: '/en/login',
    })

    expect(result).toEqual({ stored: 'memory' })
    expect(getTelemetryEvents()[0]).toMatchObject({
      event: 'click',
      sessionId: 'session-3',
      deviceId: 'device-3',
    })
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain(
      '[telemetry] Telemetry database write timed out after 1ms',
    )
    expect(warnSpy.mock.calls[0]?.[1]).toMatchObject({
      event: 'click',
      sessionId: 'session-3',
      deviceId: 'device-3',
      fallbackReason: 'db_timeout',
      timeoutMs: 1,
      storage: 'db',
      fallback: 'memory',
      error: {
        name: 'TelemetryPersistenceTimeoutError',
        message: 'Telemetry database write timed out after 1ms',
      },
    })
  })

  it('enters DB backoff after a timeout and skips the next DB attempt', async () => {
    vi.stubEnv('PG_DATABASE_URL', 'postgres://example')
    vi.stubEnv('TELEMETRY_STORAGE_MODE', 'db')
    vi.stubEnv('TELEMETRY_DB_TIMEOUT_MS', '1')
    vi.stubEnv('TELEMETRY_DB_BACKOFF_MS', '60000')
    createMock.mockImplementation(() => new Promise(() => {}))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { getTelemetryEvents, recordTelemetryEvent } = await import('@/services/telemetry.service')

    const first = await recordTelemetryEvent({
      event: 'session_start',
      sessionId: 'session-4',
      deviceId: 'device-4',
      path: '/en',
    })
    const second = await recordTelemetryEvent({
      event: 'page_view',
      sessionId: 'session-4',
      deviceId: 'device-4',
      path: '/en',
    })

    expect(first).toEqual({ stored: 'memory' })
    expect(second).toEqual({ stored: 'memory' })
    expect(createMock).toHaveBeenCalledTimes(1)
    expect(getTelemetryEvents()).toHaveLength(2)
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it('uses memory storage by default in development even when Postgres is configured', async () => {
    vi.stubEnv('PG_DATABASE_URL', 'postgres://example')
    vi.stubEnv('NODE_ENV', 'development')

    const { getTelemetryEvents, recordTelemetryEvent } = await import('@/services/telemetry.service')
    const result = await recordTelemetryEvent({
      event: 'component_view',
      sessionId: 'session-dev',
      deviceId: 'device-dev',
      path: '/en',
    })

    expect(result).toEqual({ stored: 'memory' })
    expect(createMock).not.toHaveBeenCalled()
    expect(getTelemetryEvents()[0]).toMatchObject({
      event: 'component_view',
      sessionId: 'session-dev',
      deviceId: 'device-dev',
      path: '/en',
    })
  })
})
