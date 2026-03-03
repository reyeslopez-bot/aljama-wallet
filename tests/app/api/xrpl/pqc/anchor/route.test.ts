import { describe, expect, it } from 'vitest'

describe('app/api/xrpl/pqc/anchor route', () => {
  it('returns the placeholder 501 contract', async () => {
    const { POST } = await import('@/app/api/xrpl/pqc/anchor/route')

    const res = await POST()
    const body = await res.json()

    expect(res.status).toBe(501)
    expect(body.code).toBe('XRPL_PQC_ANCHOR_UNAVAILABLE')
    expect(body.error).toContain('managed XRPL custody')
  })
})
