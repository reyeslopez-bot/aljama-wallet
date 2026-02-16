import Link from 'next/link'

const TARGET_ORDER = ['gdpr', 'soc2', 'iso'] as const

type TargetKey = (typeof TARGET_ORDER)[number]

type RoadmapCheckpoint = {
  title: string
  detail: string
  status: 'Planned' | 'In progress' | 'Queued'
}

type RoadmapTarget = {
  title: string
  overview: string
  reference: string
  referenceLinks: Array<{ label: string; href: string }>
  nextReview: string
  checkpoints: RoadmapCheckpoint[]
}

const ROADMAP: Record<TargetKey, RoadmapTarget> = {
  gdpr: {
    title: 'GDPR alignment',
    overview:
      'Privacy and data handling controls to support lawful processing, user rights workflows, and audit-ready records.',
    reference: 'GDPR Articles 5, 6, 25, 30, 32 and 35',
    referenceLinks: [
      { label: 'EU GDPR text (EUR-Lex)', href: 'https://eur-lex.europa.eu/eli/reg/2016/679/oj' },
    ],
    nextReview: 'Review window: March 2026',
    checkpoints: [
      {
        title: 'Data inventory and purpose mapping',
        detail: 'Map personal data flows by region and bind each flow to legal basis and retention period.',
        status: 'In progress',
      },
      {
        title: 'Consent and preference controls',
        detail: 'Implement explicit consent capture plus withdrawal flows with immutable event logs.',
        status: 'Planned',
      },
      {
        title: 'Data subject request workflow',
        detail: 'Add export, correction, and deletion pipelines with SLA tracking and evidence capture.',
        status: 'Planned',
      },
      {
        title: 'DPIA and risk register process',
        detail: 'Document high-risk processing cases and maintain mitigation actions in a formal register.',
        status: 'Queued',
      },
    ],
  },
  soc2: {
    title: 'SOC 2 roadmap',
    overview:
      'Operational and security controls aligned with Trust Services Criteria for readiness and external audit scoping.',
    reference: 'AICPA SOC 2 TSC: CC1, CC2, CC3, CC6, CC7, CC8, A1',
    referenceLinks: [
      {
        label: 'AICPA SOC 2 overview',
        href: 'https://www.aicpa-cima.com/topic/audit-assurance/audit-and-assurance-greater-than-soc-2',
      },
    ],
    nextReview: 'Review window: April 2026',
    checkpoints: [
      {
        title: 'Access control hardening',
        detail: 'Enforce RBAC, least privilege, and periodic access recertification for privileged roles.',
        status: 'In progress',
      },
      {
        title: 'Change management evidence',
        detail: 'Link pull request approvals, deployment checks, and rollback plans to tracked release records.',
        status: 'Planned',
      },
      {
        title: 'Incident response readiness',
        detail: 'Run tabletop drills, define severity runbooks, and archive response timelines for audit evidence.',
        status: 'Planned',
      },
      {
        title: 'Vendor risk management',
        detail: 'Formalize third-party due diligence with annual reassessment and risk acceptance logs.',
        status: 'Queued',
      },
    ],
  },
  iso: {
    title: 'ISO 27001 roadmap',
    overview:
      'Information security management actions to align with ISO 27001 controls and support ISMS maturity.',
    reference: 'ISO/IEC 27001:2022 Clauses 4-10 and Annex A controls',
    referenceLinks: [
      { label: 'ISO 27001 standard page', href: 'https://www.iso.org/standard/27001.html' },
    ],
    nextReview: 'Review window: May 2026',
    checkpoints: [
      {
        title: 'ISMS scope and context definition',
        detail: 'Document scope boundaries, interested parties, and applicable control statements.',
        status: 'In progress',
      },
      {
        title: 'Risk assessment cadence',
        detail: 'Establish recurring risk scoring, treatment plans, and risk owner accountability.',
        status: 'Planned',
      },
      {
        title: 'Control implementation tracking',
        detail: 'Track Annex A control implementation status with evidence links and ownership metadata.',
        status: 'Planned',
      },
      {
        title: 'Internal audit + management review',
        detail: 'Schedule internal audits and executive reviews with corrective action follow-through.',
        status: 'Queued',
      },
    ],
  },
}

function normalizeTarget(value: string | undefined): TargetKey {
  if (value && TARGET_ORDER.includes(value as TargetKey)) {
    return value as TargetKey
  }

  return 'gdpr'
}

function statusClass(status: RoadmapCheckpoint['status']): string {
  if (status === 'In progress') {
    return 'border-jade/40 bg-jade/15 text-jade'
  }

  if (status === 'Planned') {
    return 'border-saffron/35 bg-saffron/15 text-saffron'
  }

  return 'border-lapis/40 bg-lapis/20 text-lapis'
}

export default async function ComplianceRoadmapPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ target?: string }>
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams])
  const activeTarget = normalizeTarget(query.target)
  const plan = ROADMAP[activeTarget]

  return (
    <section className="space-y-8">
      <div className="surface-panel panel-glow-jade relative overflow-hidden p-8 sm:p-10">
        <div className="absolute inset-x-8 top-5 ornament-line" />

        <div className="relative space-y-5">
          <p className="text-xs uppercase tracking-[0.2em] text-saffron/80">Compliance roadmap</p>
          <h1 className="font-display text-3xl font-semibold text-ivory sm:text-4xl">
            Target implementation details
          </h1>
          <p className="max-w-3xl text-sm text-ivory/70">
            This page shows what the current compliance targets map to in concrete controls. These are roadmap
            commitments and not a certification claim.
          </p>

          <div className="flex flex-wrap gap-2">
            {TARGET_ORDER.map((target) => {
              const item = ROADMAP[target]
              const active = target === activeTarget

              return (
                <Link
                  key={target}
                  href={`/${locale}/compliance?target=${target}`}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] transition ${
                    active
                      ? 'border-saffron/45 bg-saffron/20 text-ivory'
                      : 'border-white/15 bg-white/5 text-ivory/70 hover:border-saffron/25 hover:bg-saffron/10 hover:text-ivory'
                  }`}
                >
                  {item.title}
                </Link>
              )
            })}
          </div>
        </div>
      </div>

      <div className="surface-panel panel-glow-lapis p-8 sm:p-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl space-y-2">
            <p className="text-xs uppercase tracking-[0.16em] text-ivory/50">Selected target</p>
            <h2 className="font-display text-2xl font-semibold text-ivory sm:text-3xl">{plan.title}</h2>
            <p className="text-sm text-ivory/70">{plan.overview}</p>
          </div>

          <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-ivory/70">
            Targeted
          </span>
        </div>

        <div className="mt-6 space-y-3">
          {plan.checkpoints.map((checkpoint) => (
            <div key={checkpoint.title} className="surface-inner p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-ivory">{checkpoint.title}</p>
                  <p className="text-xs leading-relaxed text-ivory/65">{checkpoint.detail}</p>
                </div>

                <span
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${statusClass(
                    checkpoint.status,
                  )}`}
                >
                  {checkpoint.status}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="surface-inner p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-ivory/45">Reference scope</p>
            <p className="mt-1 text-sm text-ivory/80">{plan.reference}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {plan.referenceLinks.map((referenceLink) => (
                <a
                  key={referenceLink.href}
                  href={referenceLink.href}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-semibold tracking-[0.1em] text-ivory/75 transition hover:border-saffron/30 hover:bg-saffron/12 hover:text-ivory"
                >
                  {referenceLink.label}
                </a>
              ))}
            </div>
          </div>

          <div className="surface-inner p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-ivory/45">Governance cadence</p>
            <p className="mt-1 text-sm text-ivory/80">{plan.nextReview}</p>
          </div>
        </div>

        <div className="mt-6">
          <Link
            href={`/${locale}/#demo`}
            className="inline-flex rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm text-ivory/80 transition hover:border-saffron/35 hover:bg-saffron/10 hover:text-ivory"
          >
            Back to region and compliance
          </Link>
        </div>
      </div>
    </section>
  )
}
