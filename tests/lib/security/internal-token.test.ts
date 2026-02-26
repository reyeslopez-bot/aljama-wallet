import { beforeEach, describe, expect, it, vi } from 'vitest'
import { hasValidInternalToken } from '@/lib/security/internal-token'

function requestWithHeaders(headers: Record<string, string>): Request {
  return new Request('https://example.com/api/internal', { headers })
}

describe('internal-token', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
  })

  it('accepts a valid bearer token', () => {
    const req = requestWithHeaders({ authorization: 'Bearer secret-token' })
    expect(hasValidInternalToken(req, 'secret-token')).toBe(true)
  })

  it('rejects mismatched token values', () => {
    const req = requestWithHeaders({ authorization: 'Bearer wrong-token' })
    expect(hasValidInternalToken(req, 'secret-token')).toBe(false)
  })

  it('enforces optional internal IP allowlist when configured', () => {
    vi.stubEnv('SECURITY_INTERNAL_ALLOWED_IPS', '203.0.113.10,198.51.100.7')

    const allowedReq = requestWithHeaders({
      authorization: 'Bearer secret-token',
      'x-forwarded-for': '203.0.113.10, 10.0.0.1',
    })
    const deniedReq = requestWithHeaders({
      authorization: 'Bearer secret-token',
      'x-forwarded-for': '192.0.2.99',
    })

    expect(hasValidInternalToken(allowedReq, 'secret-token')).toBe(true)
    expect(hasValidInternalToken(deniedReq, 'secret-token')).toBe(false)
  })

  it('rejects valid tokens when allowlist is configured but client IP is missing', () => {
    vi.stubEnv('SECURITY_INTERNAL_ALLOWED_IPS', '203.0.113.10')
    const req = requestWithHeaders({ authorization: 'Bearer secret-token' })

    expect(hasValidInternalToken(req, 'secret-token')).toBe(false)
  })
})
