'use client'

import { useCallback, useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useSession } from 'next-auth/react'

type AdminUser = {
  id: string
  name: string | null
  email: string | null
  image: string | null
  createdAt: string
  lastLoginAt: string | null
}

type UserPage = {
  users?: AdminUser[]
  nextCursor?: string | null
  error?: string
}

export default function AdminUsers() {
  const t = useTranslations('userAdmin')
  const locale = useLocale()
  const { status: sessionStatus } = useSession()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')

  const loadUsers = useCallback(async (cursor?: string, append = false) => {
    if (append) setLoadingMore(true)
    else setLoading(true)
    setError('')
    try {
      const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
      const response = await fetch(`/api/admin/users${query}`)
      const body = (await response.json()) as UserPage
      if (!response.ok) throw new Error(body.error || t('loadFailed'))
      const nextUsers = body.users ?? []
      setUsers((current) => append ? [...current, ...nextUsers] : nextUsers)
      setNextCursor(body.nextCursor ?? null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('loadFailed'))
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [t])

  useEffect(() => {
    if (sessionStatus === 'authenticated') void loadUsers()
    else if (sessionStatus === 'unauthenticated') setLoading(false)
  }, [loadUsers, sessionStatus])

  const formatDate = (value: string | null) => {
    if (!value) return t('never')
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return t('unavailable')
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
  }

  return (
    <section className="space-y-6">
      <header className="surface-panel panel-glow-jade space-y-3 p-8 sm:p-10">
        <p className="text-xs uppercase tracking-[0.2em] text-saffron/80">{t('eyebrow')}</p>
        <h1 className="font-display text-3xl font-semibold text-ivory sm:text-4xl">{t('title')}</h1>
        <p className="max-w-3xl text-sm text-ivory/70">{t('intro')}</p>
      </header>

      {error ? <p role="alert" className="text-sm text-saffron">{error}</p> : null}
      {loading ? <p role="status" className="text-sm text-ivory/70">{t('loading')}</p> : null}
      {!loading && !error && users.length === 0 ? (
        <p className="text-sm text-ivory/70">{t('empty')}</p>
      ) : null}

      {users.length > 0 ? (
        <div className="surface-panel overflow-x-auto p-4 sm:p-6">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-ivory/55">
              <tr>
                <th scope="col" className="px-3 py-3">{t('username')}</th>
                <th scope="col" className="px-3 py-3">{t('email')}</th>
                <th scope="col" className="px-3 py-3">{t('registered')}</th>
                <th scope="col" className="px-3 py-3">{t('lastLogin')}</th>
                <th scope="col" className="px-3 py-3">{t('accountId')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-ivory/80">
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="px-3 py-4 font-medium text-ivory">{user.name || t('unavailable')}</td>
                  <td className="px-3 py-4">{user.email || t('unavailable')}</td>
                  <td className="px-3 py-4">{formatDate(user.createdAt)}</td>
                  <td className="px-3 py-4">{formatDate(user.lastLoginAt)}</td>
                  <td className="px-3 py-4 font-mono text-xs">{user.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {nextCursor ? (
            <button
              type="button"
              onClick={() => void loadUsers(nextCursor, true)}
              disabled={loadingMore}
              className="mt-5 rounded-xl border border-saffron/35 bg-saffron/10 px-4 py-2 text-sm font-semibold text-ivory disabled:opacity-50"
            >
              {loadingMore ? t('loading') : t('loadMore')}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
