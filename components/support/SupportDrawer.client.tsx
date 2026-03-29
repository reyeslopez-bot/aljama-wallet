'use client'

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useSession } from 'next-auth/react'
import {
  CONTACT_CATEGORY_VALUES,
  SUPPORT_DRAWER_OPEN_EVENT,
  isContactCategory,
  type ContactCategory,
  type SupportDrawerOpenDetail,
} from '@/lib/support/contact'

type SupportFormState = {
  name: string
  email: string
  category: ContactCategory
  message: string
}

type SubmitSuccessState = {
  referenceId: string
  replyWindow: string
  confirmationEmailSent: boolean
}

function buildInitialFormState(): SupportFormState {
  return {
    name: '',
    email: '',
    category: 'wallet_setup',
    message: '',
  }
}

export default function SupportDrawer() {
  const t = useTranslations('support')
  const tNavbar = useTranslations('navbar')
  const locale = useLocale()
  const { data: session } = useSession()
  const [open, setOpen] = useState(false)
  const [expandedQuestionId, setExpandedQuestionId] = useState<string>('wallet-connectors')
  const [form, setForm] = useState<SupportFormState>(() => buildInitialFormState())
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitSuccess, setSubmitSuccess] = useState<SubmitSuccessState | null>(null)

  const faqItems = useMemo(
    () =>
      [
        { id: 'wallet-connectors', category: 'wallet_setup', question: t('faq.walletConnectors.question'), answer: t('faq.walletConnectors.answer') },
        { id: 'wallet-recovery', category: 'wallet_setup', question: t('faq.walletRecovery.question'), answer: t('faq.walletRecovery.answer') },
        { id: 'login-access', category: 'account_login', question: t('faq.loginAccess.question'), answer: t('faq.loginAccess.answer') },
        { id: 'transfer-status', category: 'payments_transfers', question: t('faq.transferStatus.question'), answer: t('faq.transferStatus.answer') },
        { id: 'xrpl-actions', category: 'xrpl_trading', question: t('faq.xrplActions.question'), answer: t('faq.xrplActions.answer') },
        { id: 'compliance-region', category: 'compliance_security', question: t('faq.complianceRegion.question'), answer: t('faq.complianceRegion.answer') },
      ] satisfies Array<{ id: string; category: ContactCategory; question: string; answer: string }>,
    [t],
  )

  useEffect(() => {
    const email = session?.user?.email?.trim() ?? ''
    const name = session?.user?.name?.trim() ?? ''
    if (!email && !name) return

    setForm((current) => ({
      ...current,
      email: current.email || email,
      name: current.name || name,
    }))
  }, [session?.user?.email, session?.user?.name])

  useEffect(() => {
    const handleOpen = (event: Event) => {
      const detail = (event as CustomEvent<SupportDrawerOpenDetail>).detail
      setOpen(true)
      if (detail?.questionId) {
        setExpandedQuestionId(detail.questionId)
      }
      if (isContactCategory(detail?.category)) {
        const category = detail.category
        setForm((current) => ({ ...current, category }))
      }
      setSubmitError(null)
    }

    window.addEventListener(SUPPORT_DRAWER_OPEN_EVENT, handleOpen as EventListener)
    return () => {
      window.removeEventListener(SUPPORT_DRAWER_OPEN_EVENT, handleOpen as EventListener)
    }
  }, [])

  useEffect(() => {
    if (!open) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  if (!open) return null

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setSubmitError(null)
    setSubmitSuccess(null)

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: form.name || null,
          email: form.email,
          category: form.category,
          message: form.message,
          locale,
          source: 'support-drawer',
          pagePath: typeof window !== 'undefined' ? window.location.pathname : null,
        }),
      })

      const body = (await response.json()) as {
        ok?: boolean
        error?: string
        referenceId?: string
        replyWindow?: string
        confirmationEmailSent?: boolean
      }

      if (!response.ok || !body.ok || !body.referenceId || !body.replyWindow) {
        throw new Error(body.error || t('form.errorGeneric'))
      }

      setSubmitSuccess({
        referenceId: body.referenceId,
        replyWindow: body.replyWindow,
        confirmationEmailSent: Boolean(body.confirmationEmailSent),
      })
      setForm((current) => ({ ...current, message: '' }))
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : t('form.errorGeneric'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[80]">
      <button
        type="button"
        aria-label={t('close')}
        className="absolute inset-0 bg-black/65 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />

      <div className="absolute inset-x-0 bottom-0 top-auto flex max-h-[92vh] md:inset-y-0 md:right-0 md:left-auto md:max-h-none md:w-full md:max-w-xl">
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="support-drawer-title"
          data-testid="support-drawer"
          className="surface-panel panel-glow-lapis relative flex w-full flex-col overflow-hidden rounded-t-[2rem] border border-white/10 bg-[#071018]/96 md:rounded-none md:rounded-l-[2rem]"
        >
          <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4 md:px-6">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.2em] text-saffron/75">{tNavbar('help')}</p>
              <div>
                <h2 id="support-drawer-title" className="font-display text-2xl font-semibold text-ivory">
                  {t('title')}
                </h2>
                <p className="mt-1 text-sm text-ivory/70">{t('subtitle')}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full border border-white/12 bg-white/6 px-3 py-2 text-sm text-ivory/80 transition hover:border-saffron/35 hover:bg-white/10 hover:text-ivory"
            >
              {t('close')}
            </button>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 md:px-6">
            <section className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-ivory/72">{t('faq.title')}</h3>
                <p className="mt-1 text-sm text-ivory/58">{t('faq.subtitle')}</p>
              </div>

              <div className="grid gap-2">
                {faqItems.map((item) => {
                  const expanded = expandedQuestionId === item.id
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-expanded={expanded}
                      className={`surface-soft w-full rounded-2xl border px-4 py-3 text-left transition ${
                        expanded
                          ? 'border-saffron/35 bg-saffron/10 text-ivory'
                          : 'border-white/10 bg-white/4 text-ivory/78 hover:border-white/16 hover:text-ivory'
                      }`}
                      onClick={() => {
                        setExpandedQuestionId((current) => (current === item.id ? '' : item.id))
                        setForm((current) => ({ ...current, category: item.category }))
                      }}
                    >
                      <span className="flex items-center justify-between gap-3 text-sm font-medium">
                        <span>{item.question}</span>
                        <span className="text-xs text-saffron/80">{expanded ? t('faq.hide') : t('faq.show')}</span>
                      </span>
                      {expanded && (
                        <span className="mt-3 block text-sm leading-7 text-ivory/72">
                          {item.answer}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </section>

            <section className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-ivory/72">{t('form.title')}</h3>
                <p className="mt-1 text-sm text-ivory/58">{t('form.subtitle')}</p>
              </div>

              {submitSuccess && (
                <div data-testid="support-drawer-success" role="status" className="surface-inner rounded-[1.5rem] border border-jade/35 bg-jade/10 p-4 text-sm text-ivory/78">
                  <p className="font-semibold text-ivory">{t('form.successTitle')}</p>
                  <div data-testid="support-drawer-delivery-status" className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full border border-jade/25 bg-jade/12 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-jade">
                      {t('form.statusReceived')}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-ivory/82">
                      {submitSuccess.confirmationEmailSent
                        ? t('form.statusConfirmationSent')
                        : t('form.statusEmailDelayed')}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-ivory/72">
                    {t('form.referenceLabel')}: {submitSuccess.referenceId}
                  </p>
                  <p className="text-sm text-ivory/72">
                    {t('form.replyWindowLabel')}: {submitSuccess.replyWindow}
                  </p>
                  <p className="mt-2 text-sm text-ivory/72">
                    {submitSuccess.confirmationEmailSent ? t('form.confirmationSent') : t('form.confirmationPending')}
                  </p>
                </div>
              )}

              {submitError && (
                <div role="alert" className="surface-inner rounded-[1.5rem] border border-rose/35 bg-rose/10 p-4 text-sm text-ivory/80">
                  {submitError}
                </div>
              )}

              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block text-sm text-ivory/74">
                    <span className="mb-2 block text-xs uppercase tracking-[0.16em] text-ivory/55">{t('form.name')}</span>
                    <input
                      value={form.name}
                      onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                      autoComplete="name"
                      maxLength={120}
                      className="surface-inner w-full px-4 py-3 text-sm text-ivory placeholder:text-ivory/35 focus:border-saffron/45 focus:outline-none focus:ring-2 focus:ring-saffron/20"
                      placeholder={t('form.namePlaceholder')}
                    />
                  </label>

                  <label className="block text-sm text-ivory/74">
                    <span className="mb-2 block text-xs uppercase tracking-[0.16em] text-ivory/55">{t('form.email')}</span>
                    <input
                      value={form.email}
                      onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                      autoComplete="email"
                      type="email"
                      required
                      maxLength={256}
                      className="surface-inner w-full px-4 py-3 text-sm text-ivory placeholder:text-ivory/35 focus:border-saffron/45 focus:outline-none focus:ring-2 focus:ring-saffron/20"
                      placeholder={t('form.emailPlaceholder')}
                    />
                  </label>
                </div>

                <label className="block text-sm text-ivory/74">
                  <span className="mb-2 block text-xs uppercase tracking-[0.16em] text-ivory/55">{t('form.category')}</span>
                  <select
                    value={form.category}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        category: event.target.value as ContactCategory,
                      }))
                    }
                    className="surface-inner w-full px-4 py-3 text-sm text-ivory focus:border-saffron/45 focus:outline-none focus:ring-2 focus:ring-saffron/20"
                  >
                    {CONTACT_CATEGORY_VALUES.map((category) => (
                      <option key={category} value={category}>
                        {t(`categories.${category}`)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-sm text-ivory/74">
                  <span className="mb-2 block text-xs uppercase tracking-[0.16em] text-ivory/55">{t('form.message')}</span>
                  <textarea
                    value={form.message}
                    onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))}
                    required
                    minLength={10}
                    maxLength={4_000}
                    rows={6}
                    className="surface-inner min-h-[9rem] w-full resize-y px-4 py-3 text-sm text-ivory placeholder:text-ivory/35 focus:border-saffron/45 focus:outline-none focus:ring-2 focus:ring-saffron/20"
                    placeholder={t('form.messagePlaceholder')}
                  />
                </label>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-ivory/48">{t('form.privacyNote')}</p>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="rounded-xl bg-gradient-to-r from-[#f0d7a0] via-[#dda469] to-[#c7794a] px-5 py-3 text-sm font-semibold text-[#1c120a] shadow-lg shadow-[#c7794a]/30 transition hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-65"
                  >
                    {isSubmitting ? t('form.submitting') : t('form.submit')}
                  </button>
                </div>
              </form>
            </section>
          </div>
        </section>
      </div>
    </div>
  )
}
