'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { useSession } from 'next-auth/react'
import { getConsentReceiptHistory } from '@/infra/consent/receipt'

type PrivacyRequest = {
  id: string
  userId?: string
  type: 'access' | 'rectification' | 'erasure'
  description: string | null
  status: 'received' | 'under_review' | 'fulfilled' | 'rejected'
  resolution: string | null
  createdAt: string
}

type PrivacyRequestEvent = {
  id: string
  requestId: string
  changedByUserId: string
  fromStatus: string | null
  toStatus: string
  resolution: string | null
  createdAt: string
}

type ConsentReceipt = Awaited<ReturnType<typeof getConsentReceiptHistory>>[number]
type ApiError = { error?: string }

export default function PrivacyCenter() {
  const t = useTranslations('privacy')
  const locale = useLocale()
  const { status: sessionStatus } = useSession()
  const [requests, setRequests] = useState<PrivacyRequest[]>([])
  const [requestType, setRequestType] = useState<PrivacyRequest['type']>('access')
  const [description, setDescription] = useState('')
  const [resolution, setResolution] = useState('')
  const [statusEvents, setStatusEvents] = useState<PrivacyRequestEvent[]>([])
  const [consentReceipts, setConsentReceipts] = useState<ConsentReceipt[]>([])
  const [consentError, setConsentError] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const loadRequests = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/privacy/requests')
      const body = (await response.json()) as {
        requests?: PrivacyRequest[]
        statusEvents?: PrivacyRequestEvent[]
        isAdmin?: boolean
      } & ApiError
      if (!response.ok) throw new Error(body.error || t('requestLoadFailed'))
      setRequests(body.requests ?? [])
      setStatusEvents(body.statusEvents ?? [])
      setIsAdmin(Boolean(body.isAdmin))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('requestLoadFailed'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    if (sessionStatus === 'authenticated') {
      void loadRequests()
    } else if (sessionStatus === 'unauthenticated') {
      setLoading(false)
    }
  }, [loadRequests, sessionStatus])

  useEffect(() => {
    void getConsentReceiptHistory()
      .then(setConsentReceipts)
      .catch(() => setConsentError(t('consentHistoryUnavailable')))
  }, [t])

  async function downloadExport() {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch('/api/privacy/export')
      const body = (await response.json()) as ApiError
      if (!response.ok) throw new Error(body.error || t('exportFailed'))

      const blob = new Blob([JSON.stringify(body, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'aljama-account-data.json'
      link.click()
      URL.revokeObjectURL(url)
      setMessage(t('exportReady'))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('exportFailed'))
    } finally {
      setBusy(false)
    }
  }

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch('/api/privacy/requests', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: requestType, description: description.trim() || undefined }),
      })
      const body = (await response.json()) as ApiError
      if (!response.ok) throw new Error(body.error || t('requestSubmitFailed'))
      setDescription('')
      setMessage(t('requestSubmitted'))
      await loadRequests()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('requestSubmitFailed'))
    } finally {
      setBusy(false)
    }
  }

  async function updateRequestStatus(id: string, status: 'under_review' | 'fulfilled' | 'rejected') {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch('/api/privacy/requests', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id,
          status,
          ...(status === 'fulfilled' || status === 'rejected' ? { resolution: resolution.trim() } : {}),
        }),
      })
      const body = (await response.json()) as ApiError
      if (!response.ok) throw new Error(body.error || t('requestUpdateFailed'))
      setResolution('')
      setMessage(t('requestUpdated'))
      await loadRequests()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('requestUpdateFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-8">
      <header className="surface-panel panel-glow-jade space-y-4 p-8 sm:p-10">
        <p className="text-xs uppercase tracking-[0.2em] text-saffron/80">{t('eyebrow')}</p>
        <h1 className="font-display text-3xl font-semibold text-ivory sm:text-4xl">{t('title')}</h1>
        <p className="max-w-3xl text-sm text-ivory/70">{t('intro')}</p>
        <Link
          href={`/${locale}/consent`}
          className="inline-flex rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm text-ivory/80 transition hover:border-saffron/35 hover:bg-saffron/10"
        >
          {t('reviewConsent')}
        </Link>
        {isAdmin ? (
          <Link
            href={`/${locale}/admin/users`}
            className="inline-flex rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm text-ivory/80 transition hover:border-saffron/35 hover:bg-saffron/10"
          >
            {t('manageUsers')}
          </Link>
        ) : null}
        {sessionStatus === 'unauthenticated' ? (
          <Link
            href={`/${locale}/login`}
            className="inline-flex rounded-xl border border-saffron/35 bg-saffron/10 px-4 py-2 text-sm font-semibold text-ivory"
          >
            {t('signIn')}
          </Link>
        ) : null}
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="surface-panel space-y-4 p-6 sm:p-8" aria-labelledby="privacy-export-title">
          <h2 id="privacy-export-title" className="font-display text-2xl font-semibold text-ivory">
            {t('exportTitle')}
          </h2>
          <p className="text-sm leading-relaxed text-ivory/70">{t('exportDescription')}</p>
          <button
            type="button"
            onClick={() => void downloadExport()}
            disabled={busy || sessionStatus !== 'authenticated'}
            className="rounded-xl border border-saffron/35 bg-saffron/10 px-4 py-2 text-sm font-semibold text-ivory disabled:opacity-50"
          >
            {busy ? t('working') : t('download')}
          </button>
        </section>

        <section className="surface-panel space-y-4 p-6 sm:p-8" aria-labelledby="privacy-consent-history-title">
          <h2 id="privacy-consent-history-title" className="font-display text-2xl font-semibold text-ivory">
            {t('consentHistoryTitle')}
          </h2>
          {consentError ? <p role="alert" className="text-sm text-saffron">{consentError}</p> : null}
          {!consentError && consentReceipts.length === 0 ? (
            <p className="text-sm text-ivory/65">{t('noConsentHistory')}</p>
          ) : null}
          <ul className="space-y-3">
            {consentReceipts.map((receipt) => (
              <li key={receipt.id} className="surface-inner flex flex-wrap justify-between gap-3 p-4">
                <div>
                  <p className="text-sm font-semibold text-ivory">
                    {receipt.telemetryGranted ? t('telemetryEnabled') : t('telemetryDisabled')} ·{' '}
                    {receipt.locationGranted ? t('locationEnabled') : t('locationDisabled')}
                  </p>
                  <p className="mt-1 text-xs text-ivory/55">
                    {new Date(receipt.createdAt).toLocaleString()} · {t('consentVersion')}: {receipt.consentVersion}
                  </p>
                </div>
                <span className="h-fit rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-ivory/75">
                  {t(`consentChange.${receipt.changeType}`)}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="surface-panel space-y-4 p-6 sm:p-8" aria-labelledby="privacy-request-title">
          <h2 id="privacy-request-title" className="font-display text-2xl font-semibold text-ivory">
            {t('requestTitle')}
          </h2>
          <p className="text-sm leading-relaxed text-ivory/70">{t('requestDescription')}</p>
          <form className="space-y-4" onSubmit={(event) => void submitRequest(event)}>
            <label className="block space-y-2 text-sm text-ivory/80">
              <span>{t('requestType')}</span>
              <select
                value={requestType}
                onChange={(event) => setRequestType(event.target.value as PrivacyRequest['type'])}
                className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-ivory"
              >
                <option value="access">{t('types.access')}</option>
                <option value="rectification">{t('types.rectification')}</option>
                <option value="erasure">{t('types.erasure')}</option>
              </select>
            </label>
            <label className="block space-y-2 text-sm text-ivory/80">
              <span>{t('details')}</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={2_000}
                aria-describedby="privacy-request-details-hint"
                rows={3}
                className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-ivory"
              />
              <span id="privacy-request-details-hint" className="block text-xs text-ivory/50">
                {t('detailsHint')}
              </span>
            </label>
            <button
              type="submit"
              disabled={busy || sessionStatus !== 'authenticated'}
              className="rounded-xl border border-saffron/35 bg-saffron/10 px-4 py-2 text-sm font-semibold text-ivory disabled:opacity-50"
            >
              {busy ? t('working') : t('submitRequest')}
            </button>
          </form>
        </section>
      </div>

      <section className="surface-panel space-y-4 p-6 sm:p-8" aria-labelledby="privacy-history-title">
        <h2 id="privacy-history-title" className="font-display text-2xl font-semibold text-ivory">
          {isAdmin ? t('adminQueueTitle') : t('historyTitle')}
        </h2>
        {isAdmin ? (
          <label className="block space-y-2 text-sm text-ivory/80">
            <span>{t('resolution')}</span>
            <textarea
              value={resolution}
              onChange={(event) => setResolution(event.target.value)}
              maxLength={2_000}
              rows={2}
              className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-ivory"
            />
          </label>
        ) : null}
        {loading ? <p className="text-sm text-ivory/65">{t('loading')}</p> : null}
        {!loading && requests.length === 0 ? <p className="text-sm text-ivory/65">{t('noRequests')}</p> : null}
        <ul className="space-y-3">
          {requests.map((request) => (
            <li key={request.id} className="surface-inner flex flex-wrap justify-between gap-3 p-4">
              <div>
                <p className="text-sm font-semibold text-ivory">{t(`types.${request.type}`)}</p>
                <p className="mt-1 text-xs text-ivory/55">{new Date(request.createdAt).toLocaleString()}</p>
                {isAdmin && request.userId ? (
                  <p className="mt-1 text-xs text-ivory/55">{t('accountId')}: {request.userId}</p>
                ) : null}
                {request.description ? <p className="mt-2 text-sm text-ivory/70">{request.description}</p> : null}
                {request.resolution ? <p className="mt-2 text-sm text-ivory/70">{request.resolution}</p> : null}
                {isAdmin ? (
                  <ol className="mt-3 space-y-1 text-xs text-ivory/50">
                    {statusEvents
                      .filter((item) => item.requestId === request.id)
                      .map((item) => (
                        <li key={item.id}>
                          {item.fromStatus ? t(`status.${item.fromStatus}`) : t('status.created')} →{' '}
                          {t(`status.${item.toStatus}`)} ·{' '}
                          {new Date(item.createdAt).toLocaleString()}
                        </li>
                      ))}
                  </ol>
                ) : null}
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className="h-fit rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-ivory/75">
                  {t(`status.${request.status}`)}
                </span>
                {isAdmin && request.status === 'received' ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void updateRequestStatus(request.id, 'under_review')}
                    className="text-xs text-saffron underline disabled:opacity-50"
                  >
                    {t('markUnderReview')}
                  </button>
                ) : null}
                {isAdmin && request.status === 'under_review' ? (
                  <>
                    <button
                      type="button"
                      disabled={busy || resolution.trim().length < 10}
                      onClick={() => void updateRequestStatus(request.id, 'fulfilled')}
                      className="text-xs text-jade underline disabled:opacity-50"
                    >
                      {t('markFulfilled')}
                    </button>
                    <button
                      type="button"
                      disabled={busy || resolution.trim().length < 10}
                      onClick={() => void updateRequestStatus(request.id, 'rejected')}
                      className="text-xs text-red-300 underline disabled:opacity-50"
                    >
                      {t('rejectRequest')}
                    </button>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {error ? <p role="alert" className="text-sm text-red-300">{error}</p> : null}
      {message ? <p role="status" className="text-sm text-jade">{message}</p> : null}
      <p className="text-xs leading-relaxed text-ivory/50">{t('limitation')}</p>
      <Link href={`/${locale}/compliance`} className="text-sm text-saffron/85 underline">
        {t('backToCompliance')}
      </Link>
    </section>
  )
}
