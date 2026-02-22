import { describe, expect, it, vi } from 'vitest'

const { mockSendWalletRequest } = vi.hoisted(() => ({
  mockSendWalletRequest: vi.fn(),
}))

vi.mock('@/app/api/wallet/send/route', () => ({
  sendWalletRequest: mockSendWalletRequest,
}))

function buildContext(id: string) {
  return {
    params: Promise.resolve({ id }),
  }
}

describe('app/api/wallet/[id]/send route', () => {
  it('returns 400 when wallet id is blank', async () => {
    const { POST } = await import('@/app/api/wallet/[id]/send/route')
    const req = new Request('http://localhost/api/wallet/%20/send', {
      method: 'POST',
      body: JSON.stringify({}),
    })

    const res = await POST(req, buildContext(' '))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.code).toBe('invalid_wallet_id')
    expect(mockSendWalletRequest).not.toHaveBeenCalled()
  })

  it('forwards request to shared sender with path wallet id', async () => {
    mockSendWalletRequest.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const { POST } = await import('@/app/api/wallet/[id]/send/route')
    const req = new Request('http://localhost/api/wallet/wallet-9/send', {
      method: 'POST',
      body: JSON.stringify({ to: '0xabc' }),
    })

    const res = await POST(req, buildContext('wallet-9'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(mockSendWalletRequest).toHaveBeenCalledTimes(1)
    expect(mockSendWalletRequest.mock.calls[0]?.[1]).toBe('wallet-9')
  })
})
