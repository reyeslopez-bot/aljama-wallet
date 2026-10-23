'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'

type Framework = 'GDPR' | 'SOC2' | 'ISO27001' | 'INTERNAL'
type RecordKind =
  | 'data_inventory'
  | 'dpia'
  | 'risk'
  | 'access_review'
  | 'change_evidence'
  | 'incident_exercise'
  | 'vendor_assessment'
  | 'isms_control'
  | 'internal_audit'
  | 'management_review'
type RecordStatus =
  | 'planned'
  | 'in_progress'
  | 'blocked'
  | 'needs_action'
  | 'accepted_risk'
  | 'implemented'
  | 'not_applicable'

type ReviewedSubject = {
  email: string
  disposition: 'retain' | 'remove' | 'adjust'
  rationale: string
}

type GovernanceEvent = {
  id: string
  changedByUserId: string
  action: string
  fromStatus: RecordStatus | null
  toStatus: RecordStatus
  summary: string
  createdAt: string
}

type GovernanceRecord = {
  id: string
  framework: Framework
  kind: RecordKind
  title: string
  details: string
  owner: string | null
  status: RecordStatus
  evidenceUrl: string | null
  dueAt: string | null
  reviewedSubjects: ReviewedSubject[] | null
  createdByUserId: string
  createdAt: string
  updatedAt: string
  events: GovernanceEvent[]
}

const KINDS: RecordKind[] = [
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
]
const TRANSITIONS: Record<RecordStatus, RecordStatus[]> = {
  planned: ['in_progress', 'blocked', 'not_applicable'],
  in_progress: ['implemented', 'blocked', 'needs_action', 'accepted_risk'],
  blocked: ['planned', 'in_progress'],
  needs_action: ['in_progress', 'accepted_risk', 'implemented', 'blocked'],
  accepted_risk: ['in_progress', 'implemented'],
  implemented: ['in_progress'],
  not_applicable: ['in_progress'],
}
const KIND_LABELS: Record<RecordKind, string> = {
  data_inventory: 'Data inventory',
  dpia: 'DPIA',
  risk: 'Risk treatment',
  access_review: 'Privileged access review',
  change_evidence: 'Change management evidence',
  incident_exercise: 'Incident-response exercise',
  vendor_assessment: 'Vendor assessment',
  isms_control: 'ISMS control',
  internal_audit: 'Internal audit',
  management_review: 'Management review',
}

type ErrorPayload = { error?: string; code?: string }

export default function ComplianceGovernance() {
  const [records, setRecords] = useState<GovernanceRecord[]>([])
  const [admins, setAdmins] = useState<string[]>([])
  const [framework, setFramework] = useState<Framework>('ISO27001')
  const [kind, setKind] = useState<RecordKind>('isms_control')
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [owner, setOwner] = useState('')
  const [evidenceUrl, setEvidenceUrl] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [reviewedSubjects, setReviewedSubjects] = useState<ReviewedSubject[]>([])
  const [summaries, setSummaries] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const loadRecords = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/compliance/governance')
      const body = (await response.json()) as {
        records?: GovernanceRecord[]
        configuredAdminPrincipals?: string[]
      } & ErrorPayload
      if (!response.ok) throw new Error(body.error || 'Could not load the governance register.')
      setRecords(body.records ?? [])
      setAdmins(body.configuredAdminPrincipals ?? [])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load the governance register.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadRecords()
  }, [loadRecords])

  useEffect(() => {
    if (kind !== 'access_review') {
      setReviewedSubjects([])
      return
    }
    setReviewedSubjects(
      admins.map((email) => ({
        email,
        disposition: 'retain',
        rationale: '',
      })),
    )
  }, [admins, kind])

  async function createRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch('/api/compliance/governance', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          framework,
          kind,
          title,
          details,
          owner: owner || undefined,
          evidenceUrl: evidenceUrl || undefined,
          dueAt: dueAt ? new Date(`${dueAt}T00:00:00.000Z`).toISOString() : undefined,
          ...(kind === 'access_review' ? { reviewedSubjects } : {}),
        }),
      })
      const body = (await response.json()) as ErrorPayload
      if (!response.ok) throw new Error(body.error || 'Could not create the governance record.')
      setTitle('')
      setDetails('')
      setOwner('')
      setEvidenceUrl('')
      setDueAt('')
      setMessage('Governance record created.')
      await loadRecords()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create the governance record.')
    } finally {
      setBusy(false)
    }
  }

  async function updateStatus(id: string, status: RecordStatus) {
    const summary = summaries[id]?.trim() ?? ''
    if (summary.length < 10) {
      setError('Add a change summary of at least 10 characters before updating status.')
      return
    }
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch('/api/compliance/governance', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, status, summary }),
      })
      const body = (await response.json()) as ErrorPayload
      if (!response.ok) throw new Error(body.error || 'Could not update the governance record.')
      setSummaries((current) => ({ ...current, [id]: '' }))
      setMessage('Governance record updated.')
      await loadRecords()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update the governance record.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-8">
      <header className="surface-panel panel-glow-lapis space-y-4 p-8 sm:p-10">
        <p className="text-xs uppercase tracking-[0.2em] text-saffron/80">Internal administration</p>
        <h1 className="font-display text-3xl font-semibold text-ivory sm:text-4xl">Compliance governance register</h1>
        <p className="max-w-4xl text-sm leading-relaxed text-ivory/70">
          Record scoped control, risk, vendor, incident-exercise, audit, change, and access-review work with dated
          status history. Entries are administrative evidence records—not independent verification or certification.
          Do not enter secrets or sensitive customer data.
        </p>
      </header>

      <section className="surface-panel space-y-5 p-6 sm:p-8" aria-labelledby="governance-create-title">
        <h2 id="governance-create-title" className="font-display text-2xl font-semibold text-ivory">
          Add a governance record
        </h2>
        <form className="grid gap-4 md:grid-cols-2" onSubmit={(event) => void createRecord(event)}>
          <label className="space-y-2 text-sm text-ivory/80">
            Framework
            <select
              value={framework}
              onChange={(event) => setFramework(event.target.value as Framework)}
              className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-ivory"
            >
              <option value="GDPR">GDPR</option>
              <option value="SOC2">SOC 2</option>
              <option value="ISO27001">ISO 27001</option>
              <option value="INTERNAL">Internal</option>
            </select>
          </label>
          <label className="space-y-2 text-sm text-ivory/80">
            Record type
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value as RecordKind)}
              className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-ivory"
            >
              {KINDS.map((entry) => <option key={entry} value={entry}>{KIND_LABELS[entry]}</option>)}
            </select>
          </label>
          <label className="space-y-2 text-sm text-ivory/80 md:col-span-2">
            Title
            <input
              required
              minLength={5}
              maxLength={160}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-ivory"
            />
          </label>
          <label className="space-y-2 text-sm text-ivory/80 md:col-span-2">
            Scope, decision, evidence summary, and next steps
            <textarea
              required
              minLength={20}
              maxLength={5_000}
              rows={4}
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-ivory"
            />
          </label>
          <label className="space-y-2 text-sm text-ivory/80">
            Owner
            <input
              maxLength={256}
              value={owner}
              onChange={(event) => setOwner(event.target.value)}
              className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-ivory"
            />
          </label>
          <label className="space-y-2 text-sm text-ivory/80">
            Due date
            <input
              type="date"
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
              className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-ivory"
            />
          </label>
          <label className="space-y-2 text-sm text-ivory/80 md:col-span-2">
            Evidence link (HTTPS)
            <input
              type="url"
              value={evidenceUrl}
              onChange={(event) => setEvidenceUrl(event.target.value)}
              className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-ivory"
            />
          </label>

          {kind === 'access_review' ? (
            <fieldset className="space-y-3 md:col-span-2">
              <legend className="text-sm font-semibold text-ivory">Review every configured admin principal</legend>
              {admins.length === 0 ? (
                <p className="text-sm text-saffron">No AUTH_ADMIN_EMAILS principals are configured.</p>
              ) : null}
              {reviewedSubjects.map((subject, index) => (
                <div key={subject.email} className="grid gap-2 rounded-xl border border-white/10 p-3 sm:grid-cols-3">
                  <p className="break-all text-sm text-ivory">{subject.email}</p>
                  <select
                    value={subject.disposition}
                    onChange={(event) => setReviewedSubjects((current) => current.map((entry, currentIndex) =>
                      currentIndex === index
                        ? { ...entry, disposition: event.target.value as ReviewedSubject['disposition'] }
                        : entry))}
                    className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-ivory"
                  >
                    <option value="retain">Retain access</option>
                    <option value="remove">Recommend removal</option>
                    <option value="adjust">Recommend access adjustment</option>
                  </select>
                  <input
                    required
                    minLength={10}
                    maxLength={1_000}
                    value={subject.rationale}
                    onChange={(event) => setReviewedSubjects((current) => current.map((entry, currentIndex) =>
                      currentIndex === index ? { ...entry, rationale: event.target.value } : entry))}
                    placeholder="Role, need, and rationale"
                    className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-ivory"
                  />
                </div>
              ))}
              <p className="text-xs leading-relaxed text-ivory/55">
                Recommendations do not change AUTH_ADMIN_EMAILS or revoke access. Update deployment configuration
                separately and record the resulting change.
              </p>
            </fieldset>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="w-fit rounded-xl border border-saffron/35 bg-saffron/10 px-4 py-2 text-sm font-semibold text-ivory disabled:opacity-50 md:col-span-2"
          >
            {busy ? 'Saving…' : 'Create record'}
          </button>
        </form>
      </section>

      <section className="surface-panel space-y-5 p-6 sm:p-8" aria-labelledby="governance-list-title">
        <h2 id="governance-list-title" className="font-display text-2xl font-semibold text-ivory">Governance records</h2>
        {loading ? <p className="text-sm text-ivory/60">Loading records…</p> : null}
        {!loading && records.length === 0 ? (
          <p className="text-sm text-ivory/60">No records yet. Create an entry only when you have a real activity or evidence item to record.</p>
        ) : null}
        <ul className="space-y-4">
          {records.map((record) => (
            <li key={record.id} className="surface-inner space-y-4 rounded-xl p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-[0.12em] text-saffron/80">
                    {record.framework} · {KIND_LABELS[record.kind]}
                  </p>
                  <h3 className="text-base font-semibold text-ivory">{record.title}</h3>
                </div>
                <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-ivory/75">
                  {record.status.replaceAll('_', ' ')}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ivory/70">{record.details}</p>
              {record.reviewedSubjects?.length ? (
                <ul className="space-y-2 rounded-lg border border-white/10 p-3">
                  {record.reviewedSubjects.map((subject) => (
                    <li key={subject.email} className="text-xs leading-relaxed text-ivory/70">
                      <strong>{subject.email}</strong> — {subject.disposition}: {subject.rationale}
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="flex flex-wrap gap-4 text-xs text-ivory/50">
                {record.owner ? <span>Owner: {record.owner}</span> : null}
                {record.dueAt ? <span>Due: {new Date(record.dueAt).toLocaleDateString()}</span> : null}
                <span>Updated: {new Date(record.updatedAt).toLocaleString()}</span>
                {record.evidenceUrl ? (
                  <a href={record.evidenceUrl} target="_blank" rel="noreferrer" className="text-saffron underline">
                    Open evidence
                  </a>
                ) : null}
              </div>
              {record.events.length ? (
                <div>
                  {record.events.length === 100 ? (
                    <p className="mb-2 text-xs text-ivory/45">Showing the latest 100 status events.</p>
                  ) : null}
                  <ol className="space-y-1 border-l border-white/10 pl-3 text-xs text-ivory/50">
                    {record.events.map((item) => (
                      <li key={item.id}>
                        {item.fromStatus ? `${item.fromStatus.replaceAll('_', ' ')} → ` : ''}
                        {item.toStatus.replaceAll('_', ' ')} · {item.summary} ·{' '}
                        {new Date(item.createdAt).toLocaleString()}
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
              {TRANSITIONS[record.status].length ? (
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <input
                    value={summaries[record.id] ?? ''}
                    onChange={(event) => setSummaries((current) => ({ ...current, [record.id]: event.target.value }))}
                    placeholder="Change summary (required, at least 10 characters)"
                    maxLength={1_000}
                    className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-ivory"
                  />
                  <select
                    defaultValue=""
                    disabled={busy}
                    onChange={(event) => {
                      const next = event.target.value as RecordStatus
                      if (next) {
                        void updateStatus(record.id, next)
                        event.currentTarget.value = ''
                      }
                    }}
                    className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-ivory"
                  >
                    <option value="" disabled>Update status…</option>
                    {TRANSITIONS[record.status].map((status) => (
                      <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>
                    ))}
                  </select>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {error ? <p role="alert" className="text-sm text-red-300">{error}</p> : null}
      {message ? <p role="status" className="text-sm text-jade">{message}</p> : null}
    </section>
  )
}
