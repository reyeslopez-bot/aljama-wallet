'use client'

import { motion } from 'framer-motion'
import { useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useComponentTelemetry } from '@/infra/telemetry/useComponentTelemetry'
import { useXrplNetworkStore } from '@/infra/state/xrplNetworkStore'
import { TelemetryContext } from '@/components/telemetry/TelemetryProvider.client'
import { useDynamicInfoStore } from '@/hooks/useDynamicInfoStore'
import UnlockActionsLink from '@/components/ui/UnlockActionsLink.client'

type AssetsResponse = {
  ok: true
  account: string
  network: string
  assets: Array<{
    assetType: 'xrp' | 'issued'
    currency: string
    issuer: string | null
    value: string
    limit: string | null
  }>
}

type NftsResponse = {
  ok: true
  nfts: Array<{
    nftokenId: string | null
    uri: string | null
    issuer: string | null
    metadata: {
      name: string | null
      image: string | null
      description: string | null
    } | null
  }>
}

type OrderbookResponse = {
  ok: true
  offers: Array<{
    account: string | null
    sequence: number | null
    quality: string | null
    takerGets: unknown
    takerPays: unknown
  }>
}

type ActionHistoryResponse = {
  ok: true
  actions: Array<{
    id: string
    action: string
    status: string
    txHash: string | null
    engineResult: string | null
    updatedAt: string
  }>
}

function makeIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `00000000-0000-4000-8000-${Date.now().toString().padStart(12, '0').slice(-12)}`
}

function parseCsv(value: string | undefined): Set<string> {
  if (!value) return new Set()
  return new Set(
    value
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  )
}

function shortHash(value: string | null | undefined): string {
  if (!value) return '--'
  if (value.length <= 18) return value
  return `${value.slice(0, 8)}...${value.slice(-8)}`
}

function isMissingSignerConfig(message: string): boolean {
  return /Missing XRPL signer seed/i.test(message)
}

type CurrencyOption = {
  code: string
  label: string
}

const TRADE_CURRENCY_OPTIONS: CurrencyOption[] = [
  { code: 'XRP', label: 'XRP (Ripple)' },
  { code: 'USD', label: 'USD (US Dollar)' },
  { code: 'EUR', label: 'EUR (Euro)' },
  { code: 'AED', label: 'AED (UAE Dirham)' },
  { code: 'SAR', label: 'SAR (Saudi Riyal)' },
  { code: 'JPY', label: 'JPY (Japanese Yen)' },
  { code: 'XAU', label: 'XAU (Gold)' },
]

const ISSUED_CURRENCY_OPTIONS = TRADE_CURRENCY_OPTIONS.filter((option) => option.code !== 'XRP')

function isXrpCurrency(currency: string): boolean {
  return currency.trim().toUpperCase() === 'XRP'
}

export default function XrplTradeDesk() {
  useComponentTelemetry('XrplTradeDesk')
  const { track } = useContext(TelemetryContext)
  const pushEvent = useDynamicInfoStore((s) => s.pushEvent)
  const { status: sessionStatus } = useSession()
  const locked = sessionStatus !== 'authenticated'
  const selectedNetworkId = useXrplNetworkStore((s) => s.selectedNetworkId)

  const [region, setRegion] = useState('us')
  const blockedRegions = useMemo(
    () => parseCsv(process.env.NEXT_PUBLIC_XRPL_TRADE_BLOCKED_REGIONS),
    [],
  )
  const regionBlocked = blockedRegions.has(region.toLowerCase())

  const [assets, setAssets] = useState<AssetsResponse['assets']>([])
  const [assetsLoading, setAssetsLoading] = useState(true)
  const [assetsError, setAssetsError] = useState<string | null>(null)

  const [nfts, setNfts] = useState<NftsResponse['nfts']>([])
  const [nftsLoading, setNftsLoading] = useState(true)
  const [nftsError, setNftsError] = useState<string | null>(null)
  const [nftPage, setNftPage] = useState(1)
  const pageSize = 6

  const [offers, setOffers] = useState<OrderbookResponse['offers']>([])
  const [offersLoading, setOffersLoading] = useState(true)
  const [offersError, setOffersError] = useState<string | null>(null)
  const [pair, setPair] = useState({
    takerGetsCurrency: 'USD',
    takerGetsIssuer: '',
    takerPaysCurrency: 'XRP',
    takerPaysIssuer: '',
  })

  const [history, setHistory] = useState<ActionHistoryResponse['actions']>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [signerConfigError, setSignerConfigError] = useState<string | null>(null)

  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [trustlineForm, setTrustlineForm] = useState({
    issuer: '',
    currency: 'USD',
    limit: '1000',
  })
  const [mintForm, setMintForm] = useState({
    uri: '',
    taxon: '0',
  })
  const [offerForm, setOfferForm] = useState({
    takerGetsCurrency: 'USD',
    takerGetsIssuer: '',
    takerGetsValue: '10',
    takerPaysCurrency: 'XRP',
    takerPaysIssuer: '',
    takerPaysValue: '20',
  })
  const [offerCancelSequence, setOfferCancelSequence] = useState('')
  const [nftOfferCreateForm, setNftOfferCreateForm] = useState({
    nftokenId: '',
    mode: 'sell' as 'sell' | 'buy',
    amountXrp: '10',
    destination: '',
    owner: '',
  })
  const [nftOfferAcceptForm, setNftOfferAcceptForm] = useState({
    sellOffer: '',
    buyOffer: '',
  })
  const [nftOfferCancelIds, setNftOfferCancelIds] = useState('')
  const titleId = 'xrpl-trade-desk-title'
  const bodyId = 'xrpl-trade-desk-body'
  const regionPolicyId = 'xrpl-trade-desk-region-policy'
  const actionStatusId = 'xrpl-trade-desk-action-status'
  const actionErrorId = 'xrpl-trade-desk-action-error'

  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = window.localStorage.getItem('aljama.region')
    if (stored) {
      setRegion(stored)
    }
  }, [])

  const loadAssets = useCallback(async () => {
    if (signerConfigError) {
      setAssetsLoading(false)
      setAssetsError(signerConfigError)
      setAssets([])
      return
    }
    setAssetsLoading(true)
    setAssetsError(null)
    try {
      const res = await fetch(`/api/xrpl/account-assets?network=${selectedNetworkId}`)
      const body = (await res.json()) as AssetsResponse | { ok: false; error: string }
      if (!res.ok || !body.ok) {
        throw new Error(body.ok ? 'Failed to load XRPL assets' : body.error)
      }
      setAssets(body.assets)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load XRPL assets'
      if (isMissingSignerConfig(message)) {
        const configMessage = 'XRPL signer is not configured on the server.'
        setSignerConfigError(configMessage)
        setAssetsError(configMessage)
      } else {
        setAssetsError(message)
      }
      setAssets([])
    } finally {
      setAssetsLoading(false)
    }
  }, [selectedNetworkId, signerConfigError])

  const loadNfts = useCallback(async () => {
    if (signerConfigError) {
      setNftsLoading(false)
      setNftsError(signerConfigError)
      setNfts([])
      return
    }
    setNftsLoading(true)
    setNftsError(null)
    try {
      const res = await fetch(`/api/xrpl/nfts?network=${selectedNetworkId}&limit=24`)
      const body = (await res.json()) as NftsResponse | { ok: false; error: string }
      if (!res.ok || !body.ok) {
        throw new Error(body.ok ? 'Failed to load XRPL NFTs' : body.error)
      }
      setNfts(body.nfts)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load XRPL NFTs'
      if (isMissingSignerConfig(message)) {
        const configMessage = 'XRPL signer is not configured on the server.'
        setSignerConfigError(configMessage)
        setNftsError(configMessage)
      } else {
        setNftsError(message)
      }
      setNfts([])
    } finally {
      setNftsLoading(false)
    }
  }, [selectedNetworkId, signerConfigError])

  const loadOrderbook = useCallback(async () => {
    setOffersLoading(true)
    setOffersError(null)
    try {
      const takerGetsCurrency = pair.takerGetsCurrency.trim().toUpperCase()
      const takerPaysCurrency = pair.takerPaysCurrency.trim().toUpperCase()
      const takerGetsIssuer = pair.takerGetsIssuer.trim()
      const takerPaysIssuer = pair.takerPaysIssuer.trim()

      if (!isXrpCurrency(takerGetsCurrency) && !takerGetsIssuer) {
        setOffers([])
        setOffersError('Set an issuer for non-XRP taker gets currency.')
        return
      }
      if (!isXrpCurrency(takerPaysCurrency) && !takerPaysIssuer) {
        setOffers([])
        setOffersError('Set an issuer for non-XRP taker pays currency.')
        return
      }

      const params = new URLSearchParams({
        network: selectedNetworkId,
        takerGetsCurrency,
        takerPaysCurrency,
      })
      if (!isXrpCurrency(takerGetsCurrency) && takerGetsIssuer) {
        params.set('takerGetsIssuer', takerGetsIssuer)
      }
      if (!isXrpCurrency(takerPaysCurrency) && takerPaysIssuer) {
        params.set('takerPaysIssuer', takerPaysIssuer)
      }

      const res = await fetch(`/api/xrpl/orderbook?${params.toString()}`)
      const body = (await res.json()) as OrderbookResponse | { ok: false; error: string }
      if (!res.ok || !body.ok) {
        throw new Error(body.ok ? 'Failed to load XRPL orderbook' : body.error)
      }
      setOffers(body.offers)
    } catch (error) {
      setOffersError(error instanceof Error ? error.message : 'Failed to load XRPL orderbook')
      setOffers([])
    } finally {
      setOffersLoading(false)
    }
  }, [pair.takerGetsCurrency, pair.takerGetsIssuer, pair.takerPaysCurrency, pair.takerPaysIssuer, selectedNetworkId])

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    setHistoryError(null)
    try {
      const res = await fetch(`/api/xrpl/action-history?network=${selectedNetworkId}&limit=25`)
      const body = (await res.json()) as ActionHistoryResponse | { ok: false; error: string }
      if (!res.ok || !body.ok) {
        throw new Error('Failed to load XRPL action history')
      }
      setHistory(body.actions)
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : 'Failed to load XRPL action history')
      setHistory([])
    } finally {
      setHistoryLoading(false)
    }
  }, [selectedNetworkId])

  const refreshAll = useCallback(async () => {
    await Promise.all([loadAssets(), loadNfts(), loadOrderbook(), loadHistory()])
  }, [loadAssets, loadHistory, loadNfts, loadOrderbook])

  useEffect(() => {
    if (locked) return
    void refreshAll()
  }, [locked, refreshAll])

  const pagedNfts = useMemo(() => {
    const start = (nftPage - 1) * pageSize
    return nfts.slice(start, start + pageSize)
  }, [nftPage, nfts])
  const pageCount = Math.max(1, Math.ceil(nfts.length / pageSize))

  async function submitAction(path: string, payload: Record<string, unknown>, actionName: string) {
    if (locked || regionBlocked) return
    setSubmitting(true)
    setActionMessage(null)
    setActionError(null)
    track('xrpl_trade_action_start', { action: actionName, network: selectedNetworkId })

    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          network: selectedNetworkId,
          idempotencyKey: makeIdempotencyKey(),
        }),
      })
      const body = (await res.json()) as { ok?: boolean; error?: string; tx?: { hash?: string } }
      if (!res.ok || !body.ok) {
        throw new Error(body.error ?? `Action failed (${res.status})`)
      }
      const msg = `${actionName} submitted (${shortHash(body.tx?.hash ?? null)})`
      setActionMessage(msg)
      pushEvent({ kind: 'success', message: msg })
      track('xrpl_trade_action_success', { action: actionName, network: selectedNetworkId })
      await Promise.all([loadAssets(), loadNfts(), loadHistory()])
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Action failed'
      setActionError(message)
      pushEvent({ kind: 'error', message })
      track('xrpl_trade_action_error', { action: actionName, message, network: selectedNetworkId })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section
      aria-labelledby={titleId}
      aria-describedby={`${bodyId} ${regionBlocked ? regionPolicyId : ''}`.trim() || undefined}
      aria-busy={submitting}
      className="surface-panel panel-glow-jade relative p-7 sm:p-8"
    >
      <div className="absolute inset-x-8 top-5 ornament-line" />

      <header className="relative flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-saffron/70">XRPL Trade Desk</p>
          <h2 id={titleId} className="mt-3 font-display text-2xl font-semibold text-ivory sm:text-3xl">
            RWT assets, NFTs, and offers
          </h2>
          <p id={bodyId} className="text-sm text-ivory/70">
            Unified control surface for trustlines, NFT actions, and XRPL order flow.
          </p>
          <p className="mt-1 text-xs text-ivory/55">
            Currency selectors focus on XRP, USD, EUR, AED, SAR, JPY, and XAU.
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-[0.16em] text-ivory/50">Region</p>
          <p className="text-sm font-semibold text-ivory">{region.toUpperCase()}</p>
          {regionBlocked ? (
            <p id={regionPolicyId} className="mt-1 text-xs text-amber-200">
              Trading disabled by region policy.
            </p>
          ) : null}
        </div>
      </header>

      <div className="relative mt-6 grid gap-5 lg:grid-cols-2">
        <div className="surface-inner space-y-3 p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.16em] text-ivory/55">Asset Holdings</p>
            <button
              type="button"
              disabled={locked}
              onClick={() => void loadAssets()}
              aria-label="Refresh asset holdings"
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-ivory/70 disabled:opacity-60"
            >
              Refresh
            </button>
          </div>
          {assetsLoading ? <p className="text-sm text-ivory/60">Loading assets...</p> : null}
          {assetsError ? <p className="text-sm text-red-300">{assetsError}</p> : null}
          {!assetsLoading && !assetsError ? (
            <div className="space-y-2">
              {assets.slice(0, 10).map((asset) => (
                <div key={`${asset.currency}-${asset.issuer ?? 'xrp'}`} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm">
                  <p className="font-semibold text-ivory">
                    {asset.currency} {asset.assetType === 'issued' && asset.issuer ? `· ${shortHash(asset.issuer)}` : ''}
                  </p>
                  <p className="text-ivory/60">{asset.value}</p>
                </div>
              ))}
              {assets.length === 0 ? <p className="text-sm text-ivory/55">No assets found.</p> : null}
            </div>
          ) : null}
        </div>

        <div className="surface-inner space-y-3 p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.16em] text-ivory/55">Order Book Context</p>
            <button
              type="button"
              disabled={locked}
              onClick={() => void loadOrderbook()}
              aria-label="Refresh order book"
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-ivory/70 disabled:opacity-60"
            >
              Refresh
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <select
              value={pair.takerGetsCurrency}
              onChange={(event) => {
                const currency = event.target.value
                setPair((prev) => ({
                  ...prev,
                  takerGetsCurrency: currency,
                  takerGetsIssuer: isXrpCurrency(currency) ? '' : prev.takerGetsIssuer,
                }))
              }}
              className="rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-ivory"
              aria-label="Order book taker gets currency"
            >
              {TRADE_CURRENCY_OPTIONS.map((option) => (
                <option key={`orderbook-gets-${option.code}`} value={option.code} className="bg-black text-ivory">
                  {option.label}
                </option>
              ))}
            </select>
            <input
              value={pair.takerGetsIssuer}
              onChange={(event) => setPair((prev) => ({ ...prev, takerGetsIssuer: event.target.value }))}
              disabled={isXrpCurrency(pair.takerGetsCurrency)}
              aria-label="Order book taker gets issuer"
              className="rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-ivory disabled:cursor-not-allowed disabled:opacity-50"
              placeholder={isXrpCurrency(pair.takerGetsCurrency) ? 'No issuer for XRP' : 'Gets issuer'}
            />
            <select
              value={pair.takerPaysCurrency}
              onChange={(event) => {
                const currency = event.target.value
                setPair((prev) => ({
                  ...prev,
                  takerPaysCurrency: currency,
                  takerPaysIssuer: isXrpCurrency(currency) ? '' : prev.takerPaysIssuer,
                }))
              }}
              className="rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-ivory"
              aria-label="Order book taker pays currency"
            >
              {TRADE_CURRENCY_OPTIONS.map((option) => (
                <option key={`orderbook-pays-${option.code}`} value={option.code} className="bg-black text-ivory">
                  {option.label}
                </option>
              ))}
            </select>
            <input
              value={pair.takerPaysIssuer}
              onChange={(event) => setPair((prev) => ({ ...prev, takerPaysIssuer: event.target.value }))}
              disabled={isXrpCurrency(pair.takerPaysCurrency)}
              aria-label="Order book taker pays issuer"
              className="rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-ivory disabled:cursor-not-allowed disabled:opacity-50"
              placeholder={isXrpCurrency(pair.takerPaysCurrency) ? 'No issuer for XRP' : 'Pays issuer'}
            />
          </div>
          {offersLoading ? <p className="text-sm text-ivory/60">Loading orderbook...</p> : null}
          {offersError ? <p className="text-sm text-red-300">{offersError}</p> : null}
          {!offersLoading && !offersError ? (
            <div className="space-y-2">
              {offers.slice(0, 6).map((offer) => (
                <div key={`${offer.account ?? 'na'}-${offer.sequence ?? 0}`} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-ivory/75">
                  <p>Seq {offer.sequence ?? '--'} · {shortHash(offer.account)}</p>
                  <p>Quality: {offer.quality ?? '--'}</p>
                </div>
              ))}
              {offers.length === 0 ? <p className="text-sm text-ivory/55">No orderbook entries.</p> : null}
            </div>
          ) : null}
        </div>

        <div className="surface-inner space-y-3 p-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.16em] text-ivory/55">NFT Gallery</p>
            <button
              type="button"
              disabled={locked}
              onClick={() => void loadNfts()}
              aria-label="Refresh NFT gallery"
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-ivory/70 disabled:opacity-60"
            >
              Refresh
            </button>
          </div>
          {nftsLoading ? <p className="text-sm text-ivory/60">Loading NFTs...</p> : null}
          {nftsError ? <p className="text-sm text-red-300">{nftsError}</p> : null}
          {!nftsLoading && !nftsError ? (
            <>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {pagedNfts.map((nft, index) => (
                  <div key={nft.nftokenId ?? `nft-${index}`} className="rounded-xl border border-white/10 bg-black/30 p-3">
                    <p className="text-xs text-ivory/50">{shortHash(nft.nftokenId)}</p>
                    <p className="mt-1 text-sm font-semibold text-ivory">{nft.metadata?.name ?? 'Untitled NFT'}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-ivory/60">{nft.metadata?.description ?? nft.uri ?? 'No metadata'}</p>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between text-xs text-ivory/70">
                <button
                  type="button"
                  onClick={() => setNftPage((page) => Math.max(1, page - 1))}
                  disabled={nftPage <= 1}
                  aria-label="Previous NFT page"
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 disabled:opacity-50"
                >
                  Prev
                </button>
                <span>Page {nftPage} / {pageCount}</span>
                <button
                  type="button"
                  onClick={() => setNftPage((page) => Math.min(pageCount, page + 1))}
                  disabled={nftPage >= pageCount}
                  aria-label="Next NFT page"
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </>
          ) : null}
        </div>

        <div className="surface-inner space-y-3 p-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.16em] text-ivory/55">Signed Action History</p>
            <button
              type="button"
              disabled={locked}
              onClick={() => void loadHistory()}
              aria-label="Refresh signed action history"
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-ivory/70 disabled:opacity-60"
            >
              Refresh
            </button>
          </div>
          {historyLoading ? <p className="text-sm text-ivory/60">Loading action history...</p> : null}
          {historyError ? <p className="text-sm text-red-300">{historyError}</p> : null}
          {!historyLoading && !historyError ? (
            <div className="space-y-2">
              {history.slice(0, 10).map((item) => (
                <div key={item.id} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-ivory/75">
                  <p className="font-semibold text-ivory">{item.action} · {item.status}</p>
                  <p>tx: {shortHash(item.txHash)}</p>
                  <p>engine: {item.engineResult ?? '--'}</p>
                </div>
              ))}
              {history.length === 0 ? <p className="text-sm text-ivory/55">No actions yet.</p> : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="relative mt-6 grid gap-4 lg:grid-cols-2">
        <form
          className="surface-inner space-y-3 p-4"
          aria-labelledby="xrpl-trade-desk-trustline-title"
          aria-describedby={regionBlocked ? regionPolicyId : undefined}
          onSubmit={(event) => {
            event.preventDefault()
            void submitAction('/api/xrpl/trustline/set', trustlineForm, 'trustline_set')
          }}
        >
          <p id="xrpl-trade-desk-trustline-title" className="text-xs uppercase tracking-[0.16em] text-ivory/55">
            Set Trustline
          </p>
          <input
            value={trustlineForm.issuer}
            onChange={(event) => setTrustlineForm((prev) => ({ ...prev, issuer: event.target.value }))}
            aria-label="Trustline issuer address"
            placeholder="Issuer address"
            className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory"
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              value={trustlineForm.currency}
              onChange={(event) => setTrustlineForm((prev) => ({ ...prev, currency: event.target.value }))}
              className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory"
              aria-label="Trustline currency"
            >
              {ISSUED_CURRENCY_OPTIONS.map((option) => (
                <option key={`trustline-${option.code}`} value={option.code} className="bg-black text-ivory">
                  {option.label}
                </option>
              ))}
            </select>
            <input
              value={trustlineForm.limit}
              onChange={(event) => setTrustlineForm((prev) => ({ ...prev, limit: event.target.value }))}
              aria-label="Trustline limit"
              placeholder="Limit"
              className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory"
            />
          </div>
          <button
            type="submit"
            disabled={locked || regionBlocked || submitting}
            className="rounded-xl bg-gradient-to-r from-[#6f96c9] via-[#5b86a8] to-[#4b9577] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            Submit Trustline
          </button>
        </form>

        <form
          className="surface-inner space-y-3 p-4"
          aria-labelledby="xrpl-trade-desk-mint-title"
          aria-describedby={regionBlocked ? regionPolicyId : undefined}
          onSubmit={(event) => {
            event.preventDefault()
            void submitAction('/api/xrpl/nft/mint', {
              uri: mintForm.uri,
              taxon: Number(mintForm.taxon || 0),
            }, 'nft_mint')
          }}
        >
          <p id="xrpl-trade-desk-mint-title" className="text-xs uppercase tracking-[0.16em] text-ivory/55">
            Mint NFT
          </p>
          <input
            value={mintForm.uri}
            onChange={(event) => setMintForm((prev) => ({ ...prev, uri: event.target.value }))}
            aria-label="NFT metadata URI"
            placeholder="Metadata URI (https://... or ipfs://...)"
            className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory"
          />
          <input
            value={mintForm.taxon}
            onChange={(event) => setMintForm((prev) => ({ ...prev, taxon: event.target.value }))}
            aria-label="NFT taxon"
            placeholder="Taxon"
            className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory"
          />
          <button
            type="submit"
            disabled={locked || regionBlocked || submitting}
            className="rounded-xl bg-gradient-to-r from-[#e0bf7f] via-[#cc945f] to-[#b26a49] px-4 py-2 text-sm font-semibold text-[#1c120a] disabled:opacity-60"
          >
            Mint
          </button>
        </form>

        <form
          className="surface-inner space-y-3 p-4"
          aria-labelledby="xrpl-trade-desk-offer-title"
          aria-describedby={regionBlocked ? regionPolicyId : undefined}
          onSubmit={(event) => {
            event.preventDefault()
            void submitAction('/api/xrpl/trade/offer/create', {
              takerGets: {
                currency: offerForm.takerGetsCurrency.trim().toUpperCase(),
                issuer: isXrpCurrency(offerForm.takerGetsCurrency)
                  ? undefined
                  : offerForm.takerGetsIssuer || undefined,
                value: offerForm.takerGetsValue,
              },
              takerPays: {
                currency: offerForm.takerPaysCurrency.trim().toUpperCase(),
                issuer: isXrpCurrency(offerForm.takerPaysCurrency)
                  ? undefined
                  : offerForm.takerPaysIssuer || undefined,
                value: offerForm.takerPaysValue,
              },
            }, 'offer_create')
          }}
        >
          <p id="xrpl-trade-desk-offer-title" className="text-xs uppercase tracking-[0.16em] text-ivory/55">
            Create Token Offer
          </p>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={offerForm.takerGetsCurrency}
              onChange={(event) => {
                const currency = event.target.value
                setOfferForm((prev) => ({
                  ...prev,
                  takerGetsCurrency: currency,
                  takerGetsIssuer: isXrpCurrency(currency) ? '' : prev.takerGetsIssuer,
                }))
              }}
              className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory"
              aria-label="Offer taker gets currency"
            >
              {TRADE_CURRENCY_OPTIONS.map((option) => (
                <option key={`offer-gets-${option.code}`} value={option.code} className="bg-black text-ivory">
                  {option.label}
                </option>
              ))}
            </select>
            <input
              value={offerForm.takerGetsIssuer}
              onChange={(event) => setOfferForm((prev) => ({ ...prev, takerGetsIssuer: event.target.value }))}
              aria-label="Offer taker gets issuer"
              placeholder={isXrpCurrency(offerForm.takerGetsCurrency) ? 'No issuer for XRP' : 'Gets issuer'}
              disabled={isXrpCurrency(offerForm.takerGetsCurrency)}
              className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory disabled:cursor-not-allowed disabled:opacity-50"
            />
            <input
              value={offerForm.takerGetsValue}
              onChange={(event) => setOfferForm((prev) => ({ ...prev, takerGetsValue: event.target.value }))}
              aria-label="Offer taker gets value"
              placeholder="Gets value"
              className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory"
            />
            <select
              value={offerForm.takerPaysCurrency}
              onChange={(event) => {
                const currency = event.target.value
                setOfferForm((prev) => ({
                  ...prev,
                  takerPaysCurrency: currency,
                  takerPaysIssuer: isXrpCurrency(currency) ? '' : prev.takerPaysIssuer,
                }))
              }}
              className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory"
              aria-label="Offer taker pays currency"
            >
              {TRADE_CURRENCY_OPTIONS.map((option) => (
                <option key={`offer-pays-${option.code}`} value={option.code} className="bg-black text-ivory">
                  {option.label}
                </option>
              ))}
            </select>
            <input
              value={offerForm.takerPaysIssuer}
              onChange={(event) => setOfferForm((prev) => ({ ...prev, takerPaysIssuer: event.target.value }))}
              aria-label="Offer taker pays issuer"
              placeholder={isXrpCurrency(offerForm.takerPaysCurrency) ? 'No issuer for XRP' : 'Pays issuer'}
              disabled={isXrpCurrency(offerForm.takerPaysCurrency)}
              className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory disabled:cursor-not-allowed disabled:opacity-50"
            />
            <input
              value={offerForm.takerPaysValue}
              onChange={(event) => setOfferForm((prev) => ({ ...prev, takerPaysValue: event.target.value }))}
              aria-label="Offer taker pays value"
              placeholder="Pays value"
              className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory"
            />
          </div>
          <button
            type="submit"
            disabled={locked || regionBlocked || submitting}
            className="rounded-xl bg-gradient-to-r from-[#7fb0d9] via-[#5c8db4] to-[#4b7c79] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            Create Offer
          </button>
          <div className="flex items-center gap-2">
            <input
              value={offerCancelSequence}
              onChange={(event) => setOfferCancelSequence(event.target.value)}
              aria-label="Offer sequence to cancel"
              placeholder="Offer sequence to cancel"
              className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory"
            />
            <button
              type="button"
              disabled={locked || regionBlocked || submitting || !offerCancelSequence.trim()}
              onClick={() => {
                const sequence = Number(offerCancelSequence)
                if (!Number.isFinite(sequence) || sequence <= 0) return
                void submitAction('/api/xrpl/trade/offer/cancel', { offerSequence: Math.floor(sequence) }, 'offer_cancel')
              }}
              aria-label="Cancel token offer"
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-ivory disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </form>

        <form
          className="surface-inner space-y-3 p-4"
          aria-labelledby="xrpl-trade-desk-nft-offer-title"
          aria-describedby={regionBlocked ? regionPolicyId : undefined}
          onSubmit={(event) => {
            event.preventDefault()
            void submitAction('/api/xrpl/nft/offer/create', nftOfferCreateForm, 'nft_offer_create')
          }}
        >
          <p id="xrpl-trade-desk-nft-offer-title" className="text-xs uppercase tracking-[0.16em] text-ivory/55">
            NFT Offer Actions
          </p>
          <input
            value={nftOfferCreateForm.nftokenId}
            onChange={(event) => setNftOfferCreateForm((prev) => ({ ...prev, nftokenId: event.target.value }))}
            aria-label="NFT offer token ID"
            placeholder="NFTokenID"
            className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory"
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              value={nftOfferCreateForm.mode}
              onChange={(event) => setNftOfferCreateForm((prev) => ({ ...prev, mode: event.target.value as 'sell' | 'buy' }))}
              aria-label="NFT offer mode"
              className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory"
            >
              <option value="sell">Sell</option>
              <option value="buy">Buy</option>
            </select>
            <input
              value={nftOfferCreateForm.amountXrp}
              onChange={(event) => setNftOfferCreateForm((prev) => ({ ...prev, amountXrp: event.target.value }))}
              aria-label="NFT offer amount in XRP"
              placeholder="Amount XRP"
              className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory"
            />
            <input
              value={nftOfferCreateForm.destination}
              onChange={(event) => setNftOfferCreateForm((prev) => ({ ...prev, destination: event.target.value }))}
              aria-label="NFT offer destination"
              placeholder="Destination (optional)"
              className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory"
            />
            <input
              value={nftOfferCreateForm.owner}
              onChange={(event) => setNftOfferCreateForm((prev) => ({ ...prev, owner: event.target.value }))}
              aria-label="NFT offer owner"
              placeholder="Owner (optional)"
              className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory"
            />
          </div>
          <button
            type="submit"
            disabled={locked || regionBlocked || submitting}
            className="rounded-xl bg-gradient-to-r from-[#90b889] via-[#5ea47e] to-[#3b7d66] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            Create NFT Offer
          </button>
          <div className="grid grid-cols-2 gap-2">
            <input
              value={nftOfferAcceptForm.sellOffer}
              onChange={(event) => setNftOfferAcceptForm((prev) => ({ ...prev, sellOffer: event.target.value }))}
              aria-label="NFT sell offer ID"
              placeholder="Sell offer ID"
              className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory"
            />
            <input
              value={nftOfferAcceptForm.buyOffer}
              onChange={(event) => setNftOfferAcceptForm((prev) => ({ ...prev, buyOffer: event.target.value }))}
              aria-label="NFT buy offer ID"
              placeholder="Buy offer ID"
              className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory"
            />
          </div>
          <button
            type="button"
            disabled={locked || regionBlocked || submitting || (!nftOfferAcceptForm.sellOffer.trim() && !nftOfferAcceptForm.buyOffer.trim())}
            onClick={() =>
              void submitAction('/api/xrpl/nft/offer/accept', {
                sellOffer: nftOfferAcceptForm.sellOffer || undefined,
                buyOffer: nftOfferAcceptForm.buyOffer || undefined,
              }, 'nft_offer_accept')
            }
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-ivory disabled:opacity-60"
          >
            Accept NFT Offer
          </button>
          <div className="flex items-center gap-2">
            <input
              value={nftOfferCancelIds}
              onChange={(event) => setNftOfferCancelIds(event.target.value)}
              aria-label="NFT offer IDs to cancel"
              placeholder="Offer IDs (comma-separated)"
              className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory"
            />
            <button
              type="button"
              disabled={locked || regionBlocked || submitting || !nftOfferCancelIds.trim()}
              onClick={() => {
                const offerIds = nftOfferCancelIds
                  .split(',')
                  .map((id) => id.trim())
                  .filter(Boolean)
                if (offerIds.length === 0) return
                void submitAction('/api/xrpl/nft/offer/cancel', { offerIds }, 'nft_offer_cancel')
              }}
              aria-label="Cancel NFT offers"
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-ivory disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>

      <div className="relative mt-5 space-y-3">
        <motion.button
          type="button"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          disabled={locked}
          onClick={() => void refreshAll()}
          aria-describedby={regionBlocked ? regionPolicyId : undefined}
          className="inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-[#6f96c9] via-[#5b86a8] to-[#4b9577] px-5 py-3 text-base font-semibold tracking-wide text-white shadow-lg shadow-[#4b9577]/30 transition disabled:cursor-not-allowed disabled:opacity-60"
        >
          Refresh Trade Desk
        </motion.button>

        {locked ? (
          <UnlockActionsLink
            className="text-xs uppercase tracking-[0.18em] text-ivory/50"
          />
        ) : null}
        {actionMessage ? (
          <p id={actionStatusId} role="status" aria-live="polite" className="text-sm text-jade">
            {actionMessage}
          </p>
        ) : null}
        {actionError ? (
          <p id={actionErrorId} role="alert" className="text-sm text-red-300">
            {actionError}
          </p>
        ) : null}
      </div>
    </section>
  )
}
