import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockFindMany,
  mockFindUnique,
  mockCreate,
  mockUpdateMany,
  mockEventCreate,
  mockTransaction,
  mockRequireSession,
  mockIsAdminEmail,
  mockIsAllowedOrigin,
  mockBuildRateLimitKey,
  mockRateLimit,
} = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockFindUnique: vi.fn(),
  mockCreate: vi.fn(),
  mockUpdateMany: vi.fn(),
  mockEventCreate: vi.fn(),
  mockTransaction: vi.fn(),
  mockRequireSession: vi.fn(),
  mockIsAdminEmail: vi.fn(),
  mockIsAllowedOrigin: vi.fn(),
  mockBuildRateLimitKey: vi.fn(),
  mockRateLimit: vi.fn(),
}))

vi.mock('@/lib/prisma-pg', () => ({
  prismaPg: {
    governanceRecord: { findMany: mockFindMany },
    $transaction: mockTransaction,
  },
}))
vi.mock('@/lib/security/session', () => ({
  requireSession: mockRequireSession,
  isAdminEmail: mockIsAdminEmail,
}))
vi.mock('@/lib/security/origin', () => ({ isAllowedOrigin: mockIsAllowedOrigin }))
vi.mock('@/lib/security/rate-limit', () => ({
  buildRateLimitKey: mockBuildRateLimitKey,
  rateLimit: mockRateLimit,
}))

function buildRequest(method: string, body?: unknown) {
  return new Request('http://localhost/api/compliance/governance', {
    method,
    headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

describe('app/api/compliance/governance route', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.stubEnv('PG_DATABASE_URL', 'postgres://example')
    vi.stubEnv('AUTH_ADMIN_EMAILS', 'admin@example.com,reviewer@example.com')
    mockRequireSession.mockResolvedValue({ user: { id: 'admin-1', email: 'admin@example.com' } })
    mockIsAdminEmail.mockReturnValue(true)
    mockIsAllowedOrigin.mockReturnValue(true)
    mockBuildRateLimitKey.mockReturnValue('user:admin-1')
    mockRateLimit.mockResolvedValue({ ok: true })
    mockFindMany.mockResolvedValue([])
    mockFindUnique.mockResolvedValue({
      id: 'record-1',
      status: 'in_progress',
      evidenceUrl: 'https://evidence.example.com/control-review.pdf',
    })
    mockUpdateMany.mockResolvedValue({ count: 1 })
    mockCreate.mockResolvedValue({
      id: 'record-1',
      framework: 'ISO27001',
      kind: 'isms_control',
      title: 'Document ISMS boundaries',
      status: 'planned',
      createdAt: new Date('2026-10-23T10:00:00Z'),
    })
    mockEventCreate.mockResolvedValue({ id: 'event-1' })
    mockTransaction.mockImplementation((work) =>
      work({
        governanceRecord: {
          create: mockCreate,
          findUnique: mockFindUnique,
          updateMany: mockUpdateMany,
        },
        governanceRecordEvent: { create: mockEventCreate },
      }),
    )
  })

  it('restricts the governance register to configured admins', async () => {
    mockIsAdminEmail.mockReturnValue(false)
    const { GET } = await import('@/app/api/compliance/governance/route')
    const response = await GET(buildRequest('GET'))

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({ code: 'forbidden' })
    expect(mockFindMany).not.toHaveBeenCalled()
  })

  it('lists records and configured admin principals only to admins', async () => {
    const { GET } = await import('@/app/api/compliance/governance/route')
    const response = await GET(buildRequest('GET'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      records: [],
      configuredAdminPrincipals: ['admin@example.com', 'reviewer@example.com'],
    })
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 200 }))
  })

  it('records a governance item and immutable creation event atomically', async () => {
    const { POST } = await import('@/app/api/compliance/governance/route')
    const response = await POST(buildRequest('POST', {
      framework: 'ISO27001',
      kind: 'isms_control',
      title: 'Document ISMS boundaries',
      details: 'Define included systems, services, locations, dependencies, and exclusions.',
      status: 'planned',
    }))

    expect(response.status).toBe(201)
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        createdByUserId: 'admin-1',
        framework: 'ISO27001',
        status: 'planned',
      }),
    }))
    expect(mockEventCreate).toHaveBeenCalledWith({
      data: {
        recordId: 'record-1',
        changedByUserId: 'admin-1',
        action: 'created',
        fromStatus: null,
        toStatus: 'planned',
        summary: 'Governance record created',
      },
    })
  })

  it('requires each configured admin to be reviewed before recording an access review', async () => {
    const { POST } = await import('@/app/api/compliance/governance/route')
    const incomplete = await POST(buildRequest('POST', {
      framework: 'SOC2',
      kind: 'access_review',
      title: 'October privileged access review',
      details: 'Review current privileged identities and record role necessity and access scope.',
      reviewedSubjects: [{
        email: 'admin@example.com',
        disposition: 'retain',
        rationale: 'Account owner confirmed continuing operations responsibility.',
      }],
    }))
    expect(incomplete.status).toBe(400)
    expect(mockTransaction).not.toHaveBeenCalled()

    const complete = await POST(buildRequest('POST', {
      framework: 'SOC2',
      kind: 'access_review',
      title: 'October privileged access review',
      details: 'Review current privileged identities and record role necessity and access scope.',
      reviewedSubjects: [
        {
          email: 'admin@example.com',
          disposition: 'retain',
          rationale: 'Account owner confirmed continuing operations responsibility.',
        },
        {
          email: 'reviewer@example.com',
          disposition: 'adjust',
          rationale: 'Narrow deployment permissions after confirming current role scope.',
        },
      ],
    }))
    expect(complete.status).toBe(201)
    expect(mockCreate.mock.calls.at(-1)?.[0].data.reviewedSubjects).toHaveLength(2)
  })

  it('rejects unapproved status transitions and requires a change rationale', async () => {
    const { PATCH } = await import('@/app/api/compliance/governance/route')
    const missingRationale = await PATCH(buildRequest('PATCH', { id: 'record-1', status: 'implemented' }))
    expect(missingRationale.status).toBe(400)

    mockFindUnique.mockResolvedValue({ id: 'record-1', status: 'planned', evidenceUrl: null })
    const invalidTransition = await PATCH(buildRequest('PATCH', {
      id: 'record-1',
      status: 'implemented',
      summary: 'The control was verified and implementation completed.',
    }))
    expect(invalidTransition.status).toBe(409)
    expect(mockEventCreate).not.toHaveBeenCalled()
  })

  it('writes a status event only after a successful compare-and-set update', async () => {
    const { PATCH } = await import('@/app/api/compliance/governance/route')
    const response = await PATCH(buildRequest('PATCH', {
      id: 'record-1',
      status: 'implemented',
      summary: 'Test evidence attached and review completed by the control owner.',
    }))

    expect(response.status).toBe(200)
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: 'record-1', status: 'in_progress' },
      data: { status: 'implemented' },
    })
    expect(mockEventCreate).toHaveBeenCalledWith({
      data: {
        recordId: 'record-1',
        changedByUserId: 'admin-1',
        action: 'status_changed',
        fromStatus: 'in_progress',
        toStatus: 'implemented',
        summary: 'Test evidence attached and review completed by the control owner.',
      },
    })
  })

  it('requires a linked evidence reference before marking a record implemented', async () => {
    mockFindUnique.mockResolvedValue({ id: 'record-1', status: 'in_progress', evidenceUrl: null })
    const { PATCH } = await import('@/app/api/compliance/governance/route')
    const response = await PATCH(buildRequest('PATCH', {
      id: 'record-1',
      status: 'implemented',
      summary: 'Implementation completed after the operator verified the controls.',
    }))

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({ code: 'implementation_evidence_required' })
    expect(mockUpdateMany).not.toHaveBeenCalled()
    expect(mockEventCreate).not.toHaveBeenCalled()
  })
})
