'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { z } from 'zod'
import type { Payment, TrustSet } from 'xrpl'
import { useTranslations } from 'next-intl'
import { useDynamicInfoStore } from '@/hooks/useDynamicInfoStore'
import { useXrplNetworkStore } from '@/infra/state/xrplNetworkStore'
import { loadEncryptedSession, loadXrplAddress } from '@/lib/storage/walletSession'
import { parseClientApiError } from '@/lib/security/client-api-error'
import { makeIdempotencyKey } from '@/lib/idempotency'
import { DEFAULT_SWAP_SLIPPAGE_BPS } from '@/lib/xrpl-amount'
import { isXrplNetworkId, resolveXrplNetwork } from '@/lib/xrpl-networks'
import { formatPreviewAmount, explorerTransactionUrl } from '@/lib/xrpl-trade-helpers'
import { unlockLocalXrplSigner } from '@/lib/xrpl/local-wallet'
import { signAndSubmitLocalXrplSwap } from '@/lib/xrpl/local-swap'
import { signAndSubmitLocalXrplTrustline } from '@/lib/xrpl/local-trustline'

const quoteAmountSchema = z.object({
  currency: z.string(),
  issuer: z.string().optional(),
  value: z.string(),
})

const paymentSchema = z.custom<Payment>((value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return (
    record.TransactionType === 'Payment' &&
    typeof record.Account === 'string' &&
    typeof record.Destination === 'string' &&
    typeof record.Flags === 'number' &&
    record.Amount !== undefined &&
    record.SendMax !== undefined &&
    record.DeliverMin !== undefined
  )
})

const preparedSwapSchema = z.object({
  ok: z.literal(true),
  network: z.string().refine(isXrplNetworkId),
  account: z.string(),
  quote: z.object({
    sourceAmount: quoteAmountSchema,
    quotedSourceAmount: quoteAmountSchema,
    destinationAmount: quoteAmountSchema,
    deliverMin: quoteAmountSchema,
    pathCount: z.number(),
    alternativeCount: z.number(),
    fullReply: z.boolean(),
    slippageBps: z.number(),
  }),
  transaction: paymentSchema,
})

const trustlineTransactionSchema = z.custom<TrustSet>((value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  const limit = record.LimitAmount
  return (
    record.TransactionType === 'TrustSet' &&
    typeof record.Account === 'string' &&
    Boolean(limit) &&
    limit !== null &&
    typeof limit === 'object' &&
    !Array.isArray(limit) &&
    'currency' in limit &&
    'issuer' in limit &&
    'value' in limit
  )
})

const trustlinePrepareResponseSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('selection-required'),
    issuers: z.array(z.string()),
  }),
  z.object({
    type: z.literal('already-exists'),
    network: z.string().refine(isXrplNetworkId),
    issuer: z.string(),
    currency: z.string(),
    currentLimit: z.string(),
    balance: z.string(),
  }),
  z.object({
    type: z.literal('ready'),
    network: z.string().refine(isXrplNetworkId),
    account: z.string(),
    issuer: z.string(),
    currency: z.string(),
    limit: z.string(),
    transaction: trustlineTransactionSchema,
  }),
])

type PreparedSwap = z.infer<typeof preparedSwapSchema>
type PreparedTrustline = Extract<
  z.infer<typeof trustlinePrepareResponseSchema>,
  { type: 'ready' }
>
type Submission = {
  hash: string
  network: string
  engineResult: string | null
  validated: boolean
}

export default function XrplBuyFlow({ asset }: { asset: { symbol: string; name: string } }) {
  const t = useTranslations('xrplBuy')
  const selectedNetworkId = useXrplNetworkStore((state) => state.selectedNetworkId)
  const storeAccount = useDynamicInfoStore((state) => state.wallet.xrplAddress)
  const [savedAccount] = useState(loadXrplAddress)
  const account = storeAccount ?? savedAccount
  const [amount, setAmount] = useState('10')
  const [preparedSwap, setPreparedSwap] = useState<PreparedSwap | null>(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loadingQuote, setLoadingQuote] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submission, setSubmission] = useState<Submission | null>(null)
  const [mainnetAcknowledged, setMainnetAcknowledged] = useState(false)
  const [trustlineSetupVisible, setTrustlineSetupVisible] = useState(false)
  const [trustlineLimit, setTrustlineLimit] = useState('')
  const [trustlineIssuer, setTrustlineIssuer] = useState('')
  const [trustedIssuers, setTrustedIssuers] = useState<string[]>([])
  const [preparedTrustline, setPreparedTrustline] = useState<PreparedTrustline | null>(null)
  const [trustlineSubmission, setTrustlineSubmission] = useState<Submission | null>(null)
  const [trustlineMainnetAcknowledged, setTrustlineMainnetAcknowledged] = useState(false)
  const network = resolveXrplNetwork(selectedNetworkId)

  useEffect(() => {
    setPreparedSwap(null)
    setSubmission(null)
    setError(null)
    setMainnetAcknowledged(false)
    setTrustlineSetupVisible(false)
    setTrustlineIssuer('')
    setTrustedIssuers([])
    setPreparedTrustline(null)
    setTrustlineSubmission(null)
    setTrustlineMainnetAcknowledged(false)
  }, [account, selectedNetworkId, asset.symbol])

  async function requestQuote() {
    if (!account) {
      setError(t('walletMissing'))
      return
    }

    setError(null)
    setSubmission(null)
    setLoadingQuote(true)
    try {
      const response = await fetch('/api/xrpl/trade/swap/prepare', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          network: selectedNetworkId,
          account,
          idempotencyKey: makeIdempotencyKey(),
          sourceAmount: { currency: 'XRP', value: amount.trim() },
          destinationAsset: { currency: asset.symbol },
          slippageBps: DEFAULT_SWAP_SLIPPAGE_BPS,
        }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) {
        const message = parseClientApiError(response, body).message
        if (/^No trusted .+ trustline is configured in this wallet/i.test(message)) {
          setTrustlineSetupVisible(true)
          throw new Error(t('trustlineRequired', { asset: asset.symbol }))
        }
        if (/^No trusted (issuer policy|swap path)/i.test(message)) {
          throw new Error(t('noTrustedRoute', { asset: asset.symbol }))
        }
        throw new Error(message)
      }

      const parsed = preparedSwapSchema.safeParse(body)
      if (!parsed.success) {
        throw new Error(t('invalidQuote'))
      }
      if (parsed.data.account !== account || parsed.data.network !== selectedNetworkId) {
        throw new Error(t('quoteMismatch'))
      }

      setPreparedSwap(parsed.data)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('quoteFailed'))
    } finally {
      setLoadingQuote(false)
    }
  }

  async function prepareTrustline(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!account) return

    setError(null)
    setSubmitting(true)
    try {
      const response = await fetch('/api/xrpl/trade/trustline/prepare', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          network: selectedNetworkId,
          account,
          currency: asset.symbol,
          ...(trustlineIssuer ? { issuer: trustlineIssuer } : {}),
          limit: trustlineLimit.trim(),
          idempotencyKey: makeIdempotencyKey(),
        }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(parseClientApiError(response, body).message)
      }

      const parsed = trustlinePrepareResponseSchema.safeParse(body)
      if (!parsed.success) throw new Error(t('trustlinePrepareFailed'))

      if (parsed.data.type === 'selection-required') {
        const issuers = parsed.data.issuers
        setTrustedIssuers(issuers)
        setTrustlineIssuer((current) =>
          issuers.includes(current) ? current : issuers[0] ?? '',
        )
        return
      }
      if (parsed.data.type === 'already-exists') {
        setTrustlineSetupVisible(false)
        throw new Error(t('trustlineAlreadyExists'))
      }
      if (parsed.data.account !== account || parsed.data.network !== selectedNetworkId) {
        throw new Error(t('quoteMismatch'))
      }

      setPreparedTrustline(parsed.data)
      setTrustlineSetupVisible(false)
      setTrustlineMainnetAcknowledged(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('trustlinePrepareFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  async function confirmTrustline(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!preparedTrustline || !account || !password.trim()) return
    if (network.isProduction && !trustlineMainnetAcknowledged) {
      setError(t('mainnetAcknowledgement'))
      return
    }

    setError(null)
    setSubmitting(true)
    try {
      const encrypted = loadEncryptedSession()
      if (!encrypted) throw new Error(t('walletMissing'))

      const signer = await unlockLocalXrplSigner({ encrypted, password })
      if (signer.classicAddress !== account) throw new Error(t('walletMismatch'))

      const result = await signAndSubmitLocalXrplTrustline({
        networkId: preparedTrustline.network,
        signer,
        transaction: preparedTrustline.transaction,
        trustline: {
          currency: preparedTrustline.currency,
          issuer: preparedTrustline.issuer,
          limit: preparedTrustline.limit,
        },
      })
      setTrustlineSubmission({
        hash: result.hash,
        network: preparedTrustline.network,
        engineResult: result.engineResult,
        validated: result.validated,
      })
      setPreparedTrustline(null)
      setTrustlineMainnetAcknowledged(false)
      if (result.validated && result.engineResult !== 'tesSUCCESS') {
        setError(t('trustlineFailed', { result: result.engineResult ?? t('unknownResult') }))
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('trustlineFailedGeneric'))
    } finally {
      setPassword('')
      setSubmitting(false)
    }
  }

  async function confirmSwap(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!preparedSwap || !account || !password.trim()) return
    if (network.isProduction && !mainnetAcknowledged) {
      setError(t('mainnetAcknowledgement'))
      return
    }

    setError(null)
    setSubmitting(true)
    try {
      const encrypted = loadEncryptedSession()
      if (!encrypted) {
        throw new Error(t('walletMissing'))
      }

      const signer = await unlockLocalXrplSigner({ encrypted, password })
      if (signer.classicAddress !== account) {
        throw new Error(t('walletMismatch'))
      }

      const result = await signAndSubmitLocalXrplSwap({
        networkId: preparedSwap.network,
        signer,
        transaction: preparedSwap.transaction,
        quote: preparedSwap.quote,
      })

      setSubmission({
        hash: result.hash,
        network: preparedSwap.network,
        engineResult: result.engineResult,
        validated: result.validated,
      })
      setPreparedSwap(null)
      if (result.validated && result.engineResult !== 'tesSUCCESS') {
        setError(t('tradeFailed', { result: result.engineResult ?? t('unknownResult') }))
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('tradeFailedGeneric'))
    } finally {
      setPassword('')
      setSubmitting(false)
    }
  }

  const networkName = network.name
  const tradeSucceeded =
    submission?.validated === true && submission.engineResult === 'tesSUCCESS'
  const validatedFailure =
    submission?.validated === true &&
    submission.engineResult !== null &&
    submission.engineResult !== 'tesSUCCESS'
  const submissionUrl = submission
    ? explorerTransactionUrl(submission.network, submission.hash)
    : null

  return (
    <section
      data-testid="xrpl-buy-flow"
      className="space-y-4 rounded-2xl border border-white/10 bg-black/30 p-4"
      aria-labelledby="xrpl-buy-flow-title"
    >
      <div>
        <h3 id="xrpl-buy-flow-title" className="text-base font-semibold text-ivory">
          {t('title', { asset: asset.name })}
        </h3>
        <p className="mt-1 text-sm text-ivory/70">{t('description')}</p>
        <p className="mt-1 text-xs text-ivory/55">
          {t('trustlineNote', { asset: asset.symbol })} {t('networkFeeNote')}
        </p>
      </div>

      {account ? (
        <p className="break-all text-xs text-ivory/60">
          {t('walletLabel')}: <span className="font-mono">{account}</span>
        </p>
      ) : (
        <p className="text-sm text-amber-100" role="status">{t('walletMissing')}</p>
      )}

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <label className="block text-sm text-ivory/80">
          {t('amountLabel')}
          <input
            data-testid="xrpl-buy-amount"
            type="number"
            inputMode="decimal"
            min="0.000001"
            step="any"
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value)
              setPreparedSwap(null)
              setSubmission(null)
            }}
            className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-ivory"
          />
        </label>
        <button
          data-testid="xrpl-buy-get-quote"
          type="button"
          onClick={() => void requestQuote()}
          disabled={!account || loadingQuote || submitting}
          className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-ivory disabled:opacity-50"
        >
          {loadingQuote ? t('loadingQuote') : t('getQuote')}
        </button>
      </div>

      {trustlineSetupVisible && (
        <form
          data-testid="xrpl-buy-trustline-setup"
          onSubmit={prepareTrustline}
          className="space-y-3 rounded-xl border border-amber-100/20 bg-amber-100/5 p-3"
        >
          <h4 className="font-semibold text-ivory">{t('trustlineSetupTitle', { asset: asset.symbol })}</h4>
          <p className="text-xs text-ivory/70">{t('trustlineRiskNote')}</p>
          {trustedIssuers.length > 0 && (
            <label className="block text-sm text-ivory/80">
              {t('issuerLabel')}
              <select
                data-testid="xrpl-buy-trustline-issuer"
                value={trustlineIssuer}
                onChange={(event) => setTrustlineIssuer(event.target.value)}
                required
                className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-ivory"
              >
                {trustedIssuers.map((issuer) => (
                  <option key={issuer} value={issuer}>{issuer}</option>
                ))}
              </select>
            </label>
          )}
          <label className="block text-sm text-ivory/80">
            {t('trustlineLimitLabel', { asset: asset.symbol })}
            <input
              data-testid="xrpl-buy-trustline-limit"
              type="number"
              inputMode="decimal"
              min="0.00000001"
              step="any"
              value={trustlineLimit}
              onChange={(event) => setTrustlineLimit(event.target.value)}
              required
              className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-ivory"
            />
          </label>
          <button
            data-testid="xrpl-buy-trustline-prepare"
            type="submit"
            disabled={submitting || !trustlineLimit.trim() || (trustedIssuers.length > 1 && !trustlineIssuer)}
            className="w-full rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-ivory disabled:opacity-50"
          >
            {submitting ? t('preparingTrustline') : t('prepareTrustline')}
          </button>
        </form>
      )}

      {preparedTrustline && (
        <form
          data-testid="xrpl-buy-trustline-review"
          onSubmit={confirmTrustline}
          className="space-y-3 rounded-xl border border-amber-100/20 bg-amber-100/5 p-3"
        >
          <h4 className="font-semibold text-ivory">{t('trustlineReviewTitle')}</h4>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
            <dt className="text-ivory/60">{t('networkLabel')}</dt>
            <dd className="text-right text-ivory">{networkName}</dd>
            <dt className="text-ivory/60">{t('assetLabel')}</dt>
            <dd className="text-right text-ivory">{preparedTrustline.currency}</dd>
            <dt className="text-ivory/60">{t('issuerLabel')}</dt>
            <dd className="break-all text-right font-mono text-xs text-ivory">{preparedTrustline.issuer}</dd>
            <dt className="text-ivory/60">{t('trustlineLimitReview')}</dt>
            <dd className="text-right text-ivory">{preparedTrustline.limit} {preparedTrustline.currency}</dd>
          </dl>
          <p className="text-xs text-amber-100">{t('trustlineRiskNote')}</p>
          {network.isProduction && (
            <label className="flex gap-2 text-sm text-amber-100">
              <input
                data-testid="xrpl-buy-trustline-mainnet-acknowledgement"
                type="checkbox"
                checked={trustlineMainnetAcknowledged}
                onChange={(event) => setTrustlineMainnetAcknowledged(event.target.checked)}
                className="mt-1"
              />
              <span>{t('mainnetAcknowledgement')}</span>
            </label>
          )}
          <label className="block text-sm text-ivory/80">
            {t('walletPassword')}
            <input
              data-testid="xrpl-buy-trustline-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-ivory"
            />
          </label>
          <button
            data-testid="xrpl-buy-trustline-confirm"
            type="submit"
            disabled={
              !password.trim() ||
              submitting ||
              (network.isProduction && !trustlineMainnetAcknowledged)
            }
            className="w-full rounded-xl bg-gradient-to-r from-[#e0bf7f] via-[#cc945f] to-[#b26a49] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {submitting ? t('submittingTrustline') : t('confirmTrustline')}
          </button>
        </form>
      )}

      {preparedSwap && (
        <form
          data-testid="xrpl-buy-review"
          onSubmit={confirmSwap}
          className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-3"
          aria-label={t('reviewTitle')}
        >
          <h4 className="font-semibold text-ivory">{t('reviewTitle')}</h4>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
            <dt className="text-ivory/60">{t('networkLabel')}</dt>
            <dd className="text-right text-ivory">{networkName}</dd>
            <dt className="text-ivory/60">{t('youSpend')}</dt>
            <dd className="text-right text-ivory">
              {preparedSwap.quote.sourceAmount.value} {preparedSwap.quote.sourceAmount.currency}
            </dd>
            <dt className="text-ivory/60">{t('estimatedReceive')}</dt>
            <dd className="text-right text-ivory">
              {preparedSwap.quote.destinationAmount.value} {asset.symbol}
            </dd>
            <dt className="text-ivory/60">{t('minimumReceive')}</dt>
            <dd className="text-right text-ivory">
              {preparedSwap.quote.deliverMin.value} {asset.symbol}
            </dd>
            <dt className="text-ivory/60">{t('slippage')}</dt>
            <dd className="text-right text-ivory">
              {formatPreviewAmount(preparedSwap.quote.slippageBps / 100)}%
            </dd>
          </dl>
          <p className="text-xs text-ivory/60">{t('ledgerChangeNote')}</p>
          {network.isProduction ? (
            <label className="flex gap-2 text-sm text-amber-100">
              <input
                data-testid="xrpl-buy-mainnet-acknowledgement"
                type="checkbox"
                checked={mainnetAcknowledged}
                onChange={(event) => setMainnetAcknowledged(event.target.checked)}
                className="mt-1"
              />
              <span>{t('mainnetAcknowledgement')}</span>
            </label>
          ) : network.faucetUrl ? (
            <a
              href={network.faucetUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex text-xs text-amber-100 underline underline-offset-4"
            >
              {t('testnetFunding')}
            </a>
          ) : null}
          <label className="block text-sm text-ivory/80">
            {t('walletPassword')}
            <input
              data-testid="xrpl-buy-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-ivory"
            />
          </label>
          <button
            data-testid="xrpl-buy-confirm"
            type="submit"
            disabled={!password.trim() || submitting || (network.isProduction && !mainnetAcknowledged)}
            className="w-full rounded-xl bg-gradient-to-r from-[#e0bf7f] via-[#cc945f] to-[#b26a49] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {submitting ? t('submitting') : t('confirmTrade')}
          </button>
        </form>
      )}

      {trustlineSubmission && (
        <div data-testid="xrpl-buy-trustline-result" role="status" className="space-y-1 text-sm text-ivory/80">
          <p>
            {trustlineSubmission.validated && trustlineSubmission.engineResult === 'tesSUCCESS'
              ? t('trustlineSet')
              : trustlineSubmission.validated
                ? t('validatedFailure')
                : t('pending')}
          </p>
          <p>{t('result', { result: trustlineSubmission.engineResult ?? t('unknownResult') })}</p>
          <p className="text-xs">{t('trustlineQuoteAgain')}</p>
          <a
            href={explorerTransactionUrl(trustlineSubmission.network, trustlineSubmission.hash)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex text-amber-100 underline underline-offset-4"
          >
            {t('viewTransaction')}
          </a>
        </div>
      )}

      {error && <p data-testid="xrpl-buy-error" role="alert" className="text-sm text-red-200">{error}</p>}

      {submission && (
        <div data-testid="xrpl-buy-result" role="status" className="space-y-1 text-sm text-ivory/80">
          <p>
            {tradeSucceeded
              ? t('validated')
              : validatedFailure
                ? t('validatedFailure')
                : t('pending')}
          </p>
          <p>{t('result', { result: submission.engineResult ?? t('unknownResult') })}</p>
          {submissionUrl && (
            <a
              href={submissionUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex text-amber-100 underline underline-offset-4"
            >
              {t('viewTransaction')}
            </a>
          )}
        </div>
      )}
    </section>
  )
}
