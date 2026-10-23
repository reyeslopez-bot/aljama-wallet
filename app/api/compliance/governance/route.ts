import { z } from 'zod'
import { prismaPg } from '@/lib/prisma-pg'
import { errorJson, okJson } from '@/lib/security/api-response'
import { withApiRoute } from '@/lib/security/api-route'
import { isAllowedOrigin } from '@/lib/security/origin'
import { buildRateLimitKey, rateLimit } from '@/lib/security/rate-limit'
import { readJsonBody } from '@/lib/security/request-body'
import { isAdminEmail, requireSession } from '@/lib/security/session'

const frameworks = ['GDPR', 'SOC2', 'ISO27001', 'INTERNAL'] as const
const kinds = [
  'data_inventory',
  'dpia',
  'risk',
  'access_review',
  'change_evidence',
  'incident_exercise',
  'vendor_assessment',
  'isms_control',
  'internal_audit',
  'management_review',
] as const
const statuses = [
  'planned',
  'in_progress',
  'blocked',
  'needs_action',
  'accepted_risk',
  'implemented',
  'not_applicable',
] as const

const statusTransitions: Record<(typeof statuses)[number], readonly string[]> = {
  planned: ['in_progress', 'blocked', 'not_applicable'],
  in_progress: ['implemented', 'blocked', 'needs_action', 'accepted_risk'],
  blocked: ['planned', 'in_progress'],
  needs_action: ['in_progress', 'accepted_risk', 'implemented', 'blocked'],
  accepted_risk: ['in_progress', 'implemented'],
  implemented: ['in_progress'],
  not_applicable: ['in_progress'],
}

const subjectSchema = z.object({
  email: z.string().trim().email().max(256),
  disposition: z.enum(['retain', 'remove', 'adjust']),
  rationale: z.string().trim().min(10).max(1_000),
}).strict()

const createSchema = z.object({
  framework: z.enum(frameworks),
  kind: z.enum(kinds),
  title: z.string().trim().min(5).max(160),
  details: z.string().trim().min(20).max(5_000),
  owner: z.string().trim().max(256).optional(),
  status: z.enum(['planned', 'in_progress']).default('planned'),
  evidenceUrl: z.string().url().max(2_048).refine((value) => value.startsWith('https://')).optional(),
  dueAt: z.string().datetime().optional(),
  reviewedSubjects: z.array(subjectSchema).max(100).optional(),
}).strict()

const updateSchema = z.object({
  id: z.string().trim().min(1).max(128),
  status: z.enum(statuses),
  summary: z.string().trim().min(10).max(1_000),
}).strict()

function configuredAdminPrincipals(): string[] {
  return [...new Set(
    (process.env.AUTH_ADMIN_EMAILS ?? '')
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  )].sort()
}

type GovernanceAuth =
  | { ok: false; response: Response }
  | { ok: true; userId: string }

async function authorize(req: Request, bucket: string, limit: number): Promise<GovernanceAuth> {
  const session = await requireSession()
  if (!session?.user?.id) return { ok: false, response: errorJson(401, 'unauthorized', 'UNAUTHORIZED') }
  if (!isAdminEmail(session.user.email)) return { ok: false, response: errorJson(403, 'forbidden', 'FORBIDDEN') }
  if (!process.env.PG_DATABASE_URL && !process.env.POSTGRES_URL) {
    return {
      ok: false,
      response: errorJson(503, 'governance_storage_unavailable', 'PERSISTENT_GOVERNANCE_STORAGE_REQUIRED'),
    }
  }
  const rate = await rateLimit({
    bucket,
    key: buildRateLimitKey(req, session.user.id),
    limit,
    windowMs: 60_000,
  })
  if (!rate.ok) {
    return {
      ok: false,
      response: errorJson(429, 'rate_limited', 'RATE_LIMITED', { retryAfter: rate.retryAfter }, {
        headers: { 'retry-after': String(rate.retryAfter) },
      }),
    }
  }
  return { ok: true, userId: session.user.id }
}

async function getGovernanceRecords(req: Request) {
  const auth = await authorize(req, 'compliance-governance-read', 60)
  if (!auth.ok) return auth.response

  const records = await prismaPg.governanceRecord.findMany({
    select: {
      id: true,
      framework: true,
      kind: true,
      title: true,
      details: true,
      owner: true,
      status: true,
      evidenceUrl: true,
      dueAt: true,
      reviewedSubjects: true,
      createdByUserId: true,
      createdAt: true,
      updatedAt: true,
      events: {
        select: {
          id: true,
          changedByUserId: true,
          action: true,
          fromStatus: true,
          toStatus: true,
          summary: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      },
    },
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    take: 200,
  })
  return okJson({
    records: records.map((record) => ({ ...record, events: record.events.reverse() })),
    configuredAdminPrincipals: configuredAdminPrincipals(),
  })
}

async function createGovernanceRecord(req: Request) {
  const auth = await authorize(req, 'compliance-governance-create', 30)
  if (!auth.ok) return auth.response
  if (!isAllowedOrigin(req)) return errorJson(403, 'invalid_origin', 'INVALID_ORIGIN')

  const bodyResult = await readJsonBody(req, { maxBytes: 12_000 })
  if (!bodyResult.ok) return bodyResult.response
  const parsed = createSchema.safeParse(bodyResult.data)
  if (!parsed.success) {
    return errorJson(400, 'invalid_governance_record', 'INVALID_GOVERNANCE_RECORD', parsed.error.format())
  }

  const data = parsed.data
  if (data.kind === 'access_review') {
    const configured = configuredAdminPrincipals()
    const reviewed = (data.reviewedSubjects ?? []).map(({ email }) => email.toLowerCase()).sort()
    if (configured.length === 0 || reviewed.length !== configured.length ||
        reviewed.some((email, index) => email !== configured[index])) {
      return errorJson(400, 'incomplete_access_review', 'REVIEW_EACH_CONFIGURED_ADMIN')
    }
  } else if (data.reviewedSubjects?.length) {
    return errorJson(400, 'unexpected_review_subjects', 'REVIEW_SUBJECTS_ONLY_FOR_ACCESS_REVIEW')
  }

  const created = await prismaPg.$transaction(async (tx) => {
    const record = await tx.governanceRecord.create({
      data: {
        framework: data.framework,
        kind: data.kind,
        title: data.title,
        details: data.details,
        owner: data.owner || null,
        status: data.status,
        evidenceUrl: data.evidenceUrl ?? null,
        dueAt: data.dueAt ? new Date(data.dueAt) : null,
        reviewedSubjects: data.reviewedSubjects,
        createdByUserId: auth.userId,
      },
      select: { id: true, framework: true, kind: true, title: true, status: true, createdAt: true },
    })
    await tx.governanceRecordEvent.create({
      data: {
        recordId: record.id,
        changedByUserId: auth.userId,
        action: 'created',
        fromStatus: null,
        toStatus: record.status,
        summary: 'Governance record created',
      },
    })
    return record
  })
  return okJson({ record: created }, { status: 201 })
}

async function updateGovernanceRecord(req: Request) {
  const auth = await authorize(req, 'compliance-governance-update', 30)
  if (!auth.ok) return auth.response
  if (!isAllowedOrigin(req)) return errorJson(403, 'invalid_origin', 'INVALID_ORIGIN')

  const bodyResult = await readJsonBody(req, { maxBytes: 2_048 })
  if (!bodyResult.ok) return bodyResult.response
  const parsed = updateSchema.safeParse(bodyResult.data)
  if (!parsed.success) {
    return errorJson(400, 'invalid_governance_update', 'INVALID_GOVERNANCE_UPDATE', parsed.error.format())
  }

  const result = await prismaPg.$transaction(async (tx) => {
    const current = await tx.governanceRecord.findUnique({
      where: { id: parsed.data.id },
      select: { id: true, status: true, evidenceUrl: true },
    })
    if (!current) return { kind: 'not_found' as const }
    if (current.status === parsed.data.status) return { kind: 'unchanged' as const }
    if (!statusTransitions[current.status as (typeof statuses)[number]]?.includes(parsed.data.status)) {
      return { kind: 'invalid_transition' as const }
    }
    if (parsed.data.status === 'implemented' && !current.evidenceUrl) {
      return { kind: 'evidence_required' as const }
    }

    const updated = await tx.governanceRecord.updateMany({
      where: { id: current.id, status: current.status },
      data: { status: parsed.data.status },
    })
    if (updated.count !== 1) return { kind: 'conflict' as const }
    await tx.governanceRecordEvent.create({
      data: {
        recordId: current.id,
        changedByUserId: auth.userId,
        action: 'status_changed',
        fromStatus: current.status,
        toStatus: parsed.data.status,
        summary: parsed.data.summary,
      },
    })
    return { kind: 'updated' as const }
  })

  if (result.kind === 'not_found') return errorJson(404, 'governance_record_not_found', 'GOVERNANCE_RECORD_NOT_FOUND')
  if (result.kind === 'unchanged') return errorJson(409, 'governance_status_unchanged', 'GOVERNANCE_STATUS_UNCHANGED')
  if (result.kind === 'conflict') return errorJson(409, 'governance_record_conflict', 'GOVERNANCE_RECORD_CONFLICT')
  if (result.kind === 'invalid_transition') {
    return errorJson(409, 'invalid_status_transition', 'INVALID_STATUS_TRANSITION')
  }
  if (result.kind === 'evidence_required') {
    return errorJson(409, 'implementation_evidence_required', 'IMPLEMENTATION_EVIDENCE_REQUIRED')
  }
  return okJson({ ok: true })
}

export const GET = withApiRoute({ scope: 'api:compliance-governance', timeoutMs: 10_000 }, getGovernanceRecords)
export const POST = withApiRoute({ scope: 'api:compliance-governance:create', timeoutMs: 10_000 }, createGovernanceRecord)
export const PATCH = withApiRoute({ scope: 'api:compliance-governance:update', timeoutMs: 10_000 }, updateGovernanceRecord)
