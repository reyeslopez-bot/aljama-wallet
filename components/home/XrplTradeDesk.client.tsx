'use client'

import { useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useComponentTelemetry } from '@/infra/telemetry/useComponentTelemetry'
import { useXrplNetworkStore } from '@/infra/state/xrplNetworkStore'
import { TelemetryContext } from '@/components/telemetry/TelemetryProvider.client'
import { useDynamicInfoStore } from '@/hooks/useDynamicInfoStore'
import UnlockActionsLink from '@/components/ui/UnlockActionsLink.client'
import { parseClientApiError } from '@/lib/security/client-api-error'
import { buildTraceHeaders, createTraceId } from '@/lib/security/trace'
import { resolveXrplNetwork } from '@/lib/xrpl-networks'
import { useGsapPressable } from '@/hooks/useGsapPressable'

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

type SwapQuoteResponse = {
  ok: true
  account?: string | null
  accountExists?: boolean
  quoteMode?: 'account' | 'public'
  quote: {
    sourceAmount: {
      currency: string
      issuer?: string
      value: string
    }
    quotedSourceAmount: {
      currency: string
      issuer?: string
      value: string
    }
    destinationAmount: {
      currency: string
      issuer?: string
      value: string
    }
    deliverMin: {
      currency: string
      issuer?: string
      value: string
    }
    pathCount: number
    alternativeCount: number
    fullReply: boolean
    slippageBps: number
    sourceSelection?: string
    destinationSelection?: string
    liquiditySource?: 'path_find' | 'amm' | 'orderbook' | 'multi_hop'
    quoteMode?: 'account' | 'public'
    routeKind?: 'direct' | 'multi_hop'
    hops?: Array<{
      from: {
        currency: string
        issuer?: string
      }
      to: {
        currency: string
        issuer?: string
      }
      liquiditySource: 'amm' | 'orderbook'
    }>
  }
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

type ActivityStatus = 'pending' | 'success' | 'failed'

type ActivityRailItem = {
  id: string
  action: string
  status: ActivityStatus
  message: string
  txHash: string | null
  createdAt: number
}

type LastActionRequest = {
  path: string
  payload: Record<string, unknown>
  actionName: string
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
const DEFAULT_QUOTE_ISSUER =
  process.env.NEXT_PUBLIC_XRPL_DEFAULT_QUOTE_ISSUER?.trim() || 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'
const DEFAULT_SWAP_SLIPPAGE_BPS = 50
const ISSUER_ACCOUNT_FLAG_OPTIONS = [
  { value: '', label: 'No flag change' },
  { value: 'default_ripple', label: 'Default Ripple' },
  { value: 'require_auth', label: 'Require Auth' },
  { value: 'disallow_xrp', label: 'Disallow XRP' },
  { value: 'deposit_auth', label: 'Deposit Auth' },
] as const
const ISSUER_POLICY_STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'archived', label: 'Archived' },
] as const
const ISSUER_HOLDER_REVIEW_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'revoked', label: 'Revoked' },
] as const

function isXrpCurrency(currency: string): boolean {
  return currency.trim().toUpperCase() === 'XRP'
}

function looksLikeClassicAddress(value: string): boolean {
  return /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(value.trim())
}

function parsePositiveAmount(value: string): number | null {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return parsed
}

function formatPreviewAmount(value: number): string {
  if (!Number.isFinite(value)) return '--'
  const formatted = value.toFixed(6)
  return formatted.replace(/\.?0+$/, '')
}

function explorerTransactionUrl(networkId: string, txHash: string): string {
  const explorerBase = resolveXrplNetwork(networkId).explorerUrl.replace(/\/+$/, '')
  return `${explorerBase}/transactions/${txHash}`
}

function formatAssetSelection(currency: string, issuer: string): string {
  const code = currency.trim().toUpperCase()
  const normalizedIssuer = issuer.trim()
  if (isXrpCurrency(code) || !normalizedIssuer) return code
  return `${code} (${shortHash(normalizedIssuer)})`
}

export default function XrplTradeDesk() {
  useComponentTelemetry('XrplTradeDesk')
  const { track } = useContext(TelemetryContext)
  const pushEvent = useDynamicInfoStore((s) => s.pushEvent)
  const wallet = useDynamicInfoStore((s) => s.wallet)
  const { status: sessionStatus } = useSession()
  const authLocked = sessionStatus !== 'authenticated'
  const walletReady = Boolean(wallet.connectedAddress || wallet.createdAddress)
  const deskLocked = authLocked || !walletReady
  const selectedNetworkId = useXrplNetworkStore((s) => s.selectedNetworkId)

  const [region, setRegion] = useState('us')
  const blockedRegions = useMemo(
    () => parseCsv(process.env.NEXT_PUBLIC_XRPL_TRADE_BLOCKED_REGIONS),
    [],
  )
  const regionBlocked = blockedRegions.has(region.toLowerCase())
  const [showLaunchContext, setShowLaunchContext] = useState(false)
  const [showExpertTools, setShowExpertTools] = useState(false)

  const [assets, setAssets] = useState<AssetsResponse['assets']>([])
  const [assetsLoading, setAssetsLoading] = useState(true)
  const [assetsError, setAssetsError] = useState<string | null>(null)

  const [nfts, setNfts] = useState<NftsResponse['nfts']>([])
  const [nftsLoading, setNftsLoading] = useState(true)
  const [nftsError, setNftsError] = useState<string | null>(null)
  const [nftPage, setNftPage] = useState(1)
  const pageSize = 6

  const [offers, setOffers] = useState<OrderbookResponse['offers']>([])
  const [offersLoading, setOffersLoading] = useState(false)
  const [offersError, setOffersError] = useState<string | null>(null)
  const [swapQuote, setSwapQuote] = useState<SwapQuoteResponse['quote'] | null>(null)
  const [swapQuoteLoading, setSwapQuoteLoading] = useState(true)
  const [swapQuoteError, setSwapQuoteError] = useState<string | null>(null)
  const [hasAttemptedQuoteRefresh, setHasAttemptedQuoteRefresh] = useState(false)
  const [pair, setPair] = useState({
    takerGetsCurrency: 'USD',
    takerGetsIssuer: DEFAULT_QUOTE_ISSUER,
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
  const [activityRail, setActivityRail] = useState<ActivityRailItem[]>([])
  const [lastActionRequest, setLastActionRequest] = useState<LastActionRequest | null>(null)
  const [showSubmissionLog, setShowSubmissionLog] = useState(false)

  const [trustlineForm, setTrustlineForm] = useState({
    issuer: '',
    currency: 'USD',
    limit: '1000',
  })
  const [mintForm, setMintForm] = useState({
    uri: '',
    taxon: '0',
  })
  const [issuerAccountSetForm, setIssuerAccountSetForm] = useState({
    domain: '',
    transferFeeBps: '',
    tickSize: '',
    setFlag: '',
    clearFlag: '',
  })
  const [issuerAssetForm, setIssuerAssetForm] = useState({
    currency: 'USD',
    displayName: '',
    trustlineLimit: '',
    maxDistributionValue: '',
    assetStatus: 'active',
    programStatus: 'active',
    requireHolderApproval: true,
    distributionsEnabled: true,
    requiresAuthorizedTrustlines: true,
    allowDistributions: true,
  })
  const [issuerHolderReviewForm, setIssuerHolderReviewForm] = useState({
    holder: '',
    currency: 'USD',
    status: 'approved',
    notes: '',
  })
  const [issuerAuthorizeForm, setIssuerAuthorizeForm] = useState({
    holder: '',
    currency: 'USD',
  })
  const [issuerPaymentForm, setIssuerPaymentForm] = useState({
    destination: '',
    currency: 'USD',
    issuer: '',
    value: '100',
    destinationTag: '',
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
  const [quickSwapForm, setQuickSwapForm] = useState({
    fromCurrency: 'XRP',
    fromValue: '50',
    toCurrency: 'USD',
  })
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
  const networkConfig = useMemo(() => resolveXrplNetwork(selectedNetworkId), [selectedNetworkId])
  const networkFeeEstimateXrp = networkConfig.isProduction ? '0.0002' : '0.00012'
  const deskLockedMessage = authLocked
    ? 'Sign in to unlock the XRPL trade desk.'
    : 'Create or connect a wallet to unlock the XRPL trade desk.'

  useEffect(() => {
    if (!deskLocked) return
    setShowLaunchContext(false)
    setShowExpertTools(false)
    setShowSubmissionLog(false)
  }, [deskLocked])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = window.localStorage.getItem('aljama.region')
    if (stored) {
      setRegion(stored)
    }
  }, [])

  useEffect(() => {
    if (!showExpertTools || typeof document === 'undefined') return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [showExpertTools])

  useEffect(() => {
    if (!showExpertTools || typeof window === 'undefined') return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowExpertTools(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showExpertTools])

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
      if (!res.ok || !body || !body.ok) {
        throw new Error(parseClientApiError(res, body).message)
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
        throw new Error(parseClientApiError(res, body).message)
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

  const loadSwapQuote = useCallback(async ({ revealMissingQuote = false }: { revealMissingQuote?: boolean } = {}) => {
    if (revealMissingQuote) {
      setHasAttemptedQuoteRefresh(true)
    }

    const sourceCurrency = quickSwapForm.fromCurrency.trim().toUpperCase()
    const destinationCurrency = quickSwapForm.toCurrency.trim().toUpperCase()
    const sourceAmount = quickSwapForm.fromValue.trim()
    const sameAsset = sourceCurrency === destinationCurrency

    if (!parsePositiveAmount(sourceAmount) || sameAsset) {
      setSwapQuote(null)
      setSwapQuoteError(null)
      setSwapQuoteLoading(false)
      return
    }

    setSwapQuoteLoading(true)
    setSwapQuoteError(null)
    try {
      const params = new URLSearchParams({
        network: selectedNetworkId,
        sourceCurrency,
        sourceValue: sourceAmount,
        destinationCurrency,
        slippageBps: String(DEFAULT_SWAP_SLIPPAGE_BPS),
      })

      const res = await fetch(`/api/xrpl/trade/swap/quote?${params.toString()}`)
      const body = (await res.json()) as SwapQuoteResponse | { ok: false; error: string }
      if (!res.ok || !body.ok) {
        throw new Error(parseClientApiError(res, body).message)
      }

      setSwapQuote(body.quote)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load XRPL swap quote'
      if (isMissingSignerConfig(message)) {
        const configMessage = 'XRPL signer is not configured on the server.'
        setSignerConfigError(configMessage)
        setSwapQuoteError(configMessage)
      } else {
        setSwapQuoteError(message)
      }
      setSwapQuote(null)
    } finally {
      setSwapQuoteLoading(false)
    }
  }, [
    quickSwapForm.fromCurrency,
    quickSwapForm.fromValue,
    quickSwapForm.toCurrency,
    selectedNetworkId,
    signerConfigError,
  ])

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
      if (takerGetsIssuer && !looksLikeClassicAddress(takerGetsIssuer)) {
        setOffers([])
        setOffersError('Taker gets issuer must be a valid XRPL classic address.')
        return
      }
      if (!isXrpCurrency(takerPaysCurrency) && !takerPaysIssuer) {
        setOffers([])
        setOffersError('Set an issuer for non-XRP taker pays currency.')
        return
      }
      if (takerPaysIssuer && !looksLikeClassicAddress(takerPaysIssuer)) {
        setOffers([])
        setOffersError('Taker pays issuer must be a valid XRPL classic address.')
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
        throw new Error(parseClientApiError(res, body).message)
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
        throw new Error(parseClientApiError(res, body).message)
      }
      setHistory(body.actions)
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : 'Failed to load XRPL action history')
      setHistory([])
    } finally {
      setHistoryLoading(false)
    }
  }, [selectedNetworkId])

  useEffect(() => {
    if (deskLocked) {
      setSwapQuote(null)
      setSwapQuoteError(null)
      setSwapQuoteLoading(false)
      return
    }

    const timer = window.setTimeout(() => {
      void loadSwapQuote()
    }, 220)
    return () => window.clearTimeout(timer)
  }, [deskLocked, loadSwapQuote])

  useEffect(() => {
    if (!showExpertTools) return
    const timer = window.setTimeout(() => {
      void loadOrderbook()
    }, 220)
    return () => window.clearTimeout(timer)
  }, [loadOrderbook, showExpertTools])

  useEffect(() => {
    setHasAttemptedQuoteRefresh(false)
  }, [
    quickSwapForm.fromCurrency,
    quickSwapForm.fromValue,
    quickSwapForm.toCurrency,
    selectedNetworkId,
  ])

  useEffect(() => {
    if (deskLocked || !showLaunchContext || showExpertTools) return
    void Promise.all([loadAssets(), loadHistory()])
  }, [deskLocked, loadAssets, loadHistory, showExpertTools, showLaunchContext])

  useEffect(() => {
    if (deskLocked || !showExpertTools) return
    void Promise.all([loadAssets(), loadNfts(), loadHistory()])
  }, [deskLocked, loadAssets, loadHistory, loadNfts, showExpertTools])

  const pagedNfts = useMemo(() => {
    const start = (nftPage - 1) * pageSize
    return nfts.slice(start, start + pageSize)
  }, [nftPage, nfts])
  const pageCount = Math.max(1, Math.ceil(nfts.length / pageSize))

  const quickSwapFromIsXrp = isXrpCurrency(quickSwapForm.fromCurrency)
  const quickSwapToIsXrp = isXrpCurrency(quickSwapForm.toCurrency)
  const quickSwapFromCode = quickSwapForm.fromCurrency.trim().toUpperCase()
  const quickSwapToCode = quickSwapForm.toCurrency.trim().toUpperCase()
  const quickSwapFromAmount = parsePositiveAmount(quickSwapForm.fromValue)
  const quickSwapSelectedFromIssuer = swapQuote?.sourceAmount.issuer?.trim() ?? ''
  const quickSwapSelectedToIssuer = swapQuote?.destinationAmount.issuer?.trim() ?? ''
  const quickSwapHasDifferentDestination = quickSwapFromCode !== quickSwapToCode
  const quickSwapQuoteReady = Boolean(quickSwapFromAmount) && quickSwapHasDifferentDestination
  const quickSwapDeliverMin = parsePositiveAmount(swapQuote?.deliverMin.value ?? '')
  const quickSwapRouteSummary = useMemo(() => {
    if (!swapQuote) return null
    const hops = swapQuote.hops ?? []
    if (hops.length === 0) {
      return `${formatAssetSelection(swapQuote.sourceAmount.currency, swapQuote.sourceAmount.issuer ?? '')} -> ${formatAssetSelection(
        swapQuote.destinationAmount.currency,
        swapQuote.destinationAmount.issuer ?? '',
      )}`
    }

    const assets = [
      formatAssetSelection(hops[0]!.from.currency, hops[0]!.from.issuer ?? ''),
      ...hops.map((hop) => formatAssetSelection(hop.to.currency, hop.to.issuer ?? '')),
    ]
    return assets.join(' -> ')
  }, [swapQuote])
  const quickSwapEstimatedReceive = useMemo(() => {
    return parsePositiveAmount(swapQuote?.destinationAmount.value ?? '')
  }, [swapQuote])
  const quickSwapUnitReceive = useMemo(() => {
    if (!quickSwapEstimatedReceive || !quickSwapFromAmount) return null
    return quickSwapEstimatedReceive / quickSwapFromAmount
  }, [quickSwapEstimatedReceive, quickSwapFromAmount])
  const shouldShowMissingQuoteIssue =
    hasAttemptedQuoteRefresh && quickSwapQuoteReady && !swapQuoteLoading && !swapQuoteError && !swapQuote
  const missingQuoteMessage = useMemo(
    () =>
      `No trusted swap path is available for ${quickSwapFromCode} -> ${quickSwapToCode} on ${networkConfig.name}. Refresh the quote or switch assets.`,
    [
      networkConfig.name,
      quickSwapFromCode,
      quickSwapToCode,
    ],
  )
  const quickSwapValidationIssues = useMemo(() => {
    const issues: string[] = []
    if (!quickSwapFromAmount) {
      issues.push('Enter a valid amount greater than zero.')
    }
    if (!quickSwapHasDifferentDestination) {
      issues.push('Choose a different destination asset for quick swap.')
    }
    if (shouldShowMissingQuoteIssue) {
      issues.push(missingQuoteMessage)
    }
    if (hasAttemptedQuoteRefresh && swapQuoteError) {
      issues.push(swapQuoteError)
    }
    return issues
  }, [
    hasAttemptedQuoteRefresh,
    missingQuoteMessage,
    quickSwapFromAmount,
    quickSwapHasDifferentDestination,
    swapQuoteError,
    shouldShowMissingQuoteIssue,
  ])
  const quickSwapStatusHint = useMemo(() => {
    if (deskLocked) {
      return deskLockedMessage
    }
    if (!quickSwapFromAmount) {
      return 'Enter an amount to request a quote.'
    }
    if (!quickSwapHasDifferentDestination) {
      return 'Choose a different destination asset before requesting a quote.'
    }
    if (swapQuote && (!quickSwapFromIsXrp || !quickSwapToIsXrp)) {
      if (swapQuote.quoteMode === 'public') {
        return `Best public route: ${quickSwapRouteSummary ?? 'XRPL liquidity route'}.`
      }
      return `Best trusted route: ${quickSwapRouteSummary ?? 'XRPL liquidity route'}.`
    }
    if (quickSwapUnitReceive) {
      return `1 ${quickSwapFromCode} is pricing near ${formatPreviewAmount(quickSwapUnitReceive)} ${quickSwapToCode}.`
    }
    return 'Refresh the quote to search XRPL liquidity automatically.'
  }, [
    quickSwapFromIsXrp,
    quickSwapFromAmount,
    quickSwapFromCode,
    quickSwapHasDifferentDestination,
    quickSwapRouteSummary,
    quickSwapToCode,
    quickSwapToIsXrp,
    quickSwapUnitReceive,
    deskLocked,
    deskLockedMessage,
    swapQuote,
  ])

  useEffect(() => {
    setPair((prev) => ({
      ...prev,
      takerGetsCurrency: quickSwapToCode,
      takerGetsIssuer: quickSwapToIsXrp ? '' : quickSwapSelectedToIssuer,
      takerPaysCurrency: quickSwapFromCode,
      takerPaysIssuer: quickSwapFromIsXrp ? '' : quickSwapSelectedFromIssuer,
    }))
  }, [
    quickSwapFromCode,
    quickSwapFromIsXrp,
    quickSwapSelectedFromIssuer,
    quickSwapSelectedToIssuer,
    quickSwapToCode,
    quickSwapToIsXrp,
  ])

  async function submitAction(path: string, payload: Record<string, unknown>, actionName: string) {
    if (deskLocked || regionBlocked) return
    setSubmitting(true)
    setActionMessage(null)
    setActionError(null)
    setLastActionRequest({ path, payload, actionName })
    const activityId = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    setActivityRail((prev) => [
      {
        id: activityId,
        action: actionName,
        status: 'pending',
        message: `${actionName} pending confirmation`,
        txHash: null,
        createdAt: Date.now(),
      },
      ...prev.slice(0, 11),
    ])
    track('xrpl_trade_action_start', { action: actionName, network: selectedNetworkId })

    try {
      const traceId = createTraceId()
      const res = await fetch(path, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...buildTraceHeaders(traceId),
        },
        body: JSON.stringify({
          ...payload,
          network: selectedNetworkId,
          idempotencyKey: makeIdempotencyKey(),
        }),
      })
      const body = (await res.json().catch(() => null)) as
        | { ok: true; tx?: { hash?: string } }
        | { ok?: false; error?: string; code?: string; tx?: { hash?: string } }
        | null
      if (!res.ok || !body?.ok) {
        throw new Error(parseClientApiError(res, body).message)
      }
      const txHash = typeof body.tx?.hash === 'string' && body.tx.hash.trim() ? body.tx.hash.trim() : null
      const msg = txHash ? `${actionName} submitted (${shortHash(txHash)})` : `${actionName} completed`
      setActionMessage(msg)
      setActivityRail((prev) =>
        prev.map((item) =>
          item.id === activityId
            ? {
              ...item,
              status: 'success',
              txHash,
              message: msg,
            }
            : item,
        ),
      )
      pushEvent({ kind: 'success', message: msg })
      track('xrpl_trade_action_success', { action: actionName, network: selectedNetworkId })
      const postSubmitRefreshes: Array<Promise<unknown>> = [loadSwapQuote({ revealMissingQuote: true })]
      if (!deskLocked && (showLaunchContext || showExpertTools)) {
        postSubmitRefreshes.push(loadAssets(), loadHistory())
      }
      if (!deskLocked && showExpertTools) {
        postSubmitRefreshes.push(loadNfts(), loadOrderbook())
      }
      if (postSubmitRefreshes.length > 0) {
        await Promise.all(postSubmitRefreshes)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Action failed'
      setActionError(message)
      setActivityRail((prev) =>
        prev.map((item) =>
          item.id === activityId
            ? {
              ...item,
              status: 'failed',
              txHash: null,
              message,
            }
            : item,
        ),
      )
      pushEvent({ kind: 'error', message })
      track('xrpl_trade_action_error', { action: actionName, message, network: selectedNetworkId })
    } finally {
      setSubmitting(false)
    }
  }

  function submitIssuerAccountSet() {
    const payload: Record<string, unknown> = {}
    const domain = issuerAccountSetForm.domain.trim()
    const transferFeeBps = issuerAccountSetForm.transferFeeBps.trim()
    const tickSize = issuerAccountSetForm.tickSize.trim()

    if (domain) payload.domain = domain
    if (/^\d+$/.test(transferFeeBps)) payload.transferFeeBps = Number(transferFeeBps)
    if (/^\d+$/.test(tickSize)) payload.tickSize = Number(tickSize)
    if (issuerAccountSetForm.setFlag.trim()) payload.setFlag = issuerAccountSetForm.setFlag
    if (issuerAccountSetForm.clearFlag.trim()) payload.clearFlag = issuerAccountSetForm.clearFlag

    if (Object.keys(payload).length === 0) {
      setActionError('Add at least one issuer account setting before submitting.')
      return
    }

    void submitAction('/api/xrpl/issuer/account-set', payload, 'account_set')
  }

  function submitIssuerAssetPolicy() {
    const currency = issuerAssetForm.currency.trim().toUpperCase()
    const displayName = issuerAssetForm.displayName.trim()
    const trustlineLimit = issuerAssetForm.trustlineLimit.trim()
    const maxDistributionValue = issuerAssetForm.maxDistributionValue.trim()

    if (!currency || isXrpCurrency(currency)) {
      setActionError('Enter a non-XRP currency code for the issuer asset.')
      return
    }
    if (trustlineLimit && !/^\d+(\.\d+)?$/.test(trustlineLimit)) {
      setActionError('Trustline limit must be a positive decimal amount.')
      return
    }
    if (maxDistributionValue && !/^\d+(\.\d+)?$/.test(maxDistributionValue)) {
      setActionError('Maximum distribution value must be a positive decimal amount.')
      return
    }

    void submitAction('/api/xrpl/issuer/asset', {
      currency,
      displayName: displayName || undefined,
      trustlineLimit: trustlineLimit || undefined,
      maxDistributionValue: maxDistributionValue || undefined,
      status: issuerAssetForm.assetStatus,
      programStatus: issuerAssetForm.programStatus,
      requireHolderApproval: issuerAssetForm.requireHolderApproval,
      distributionsEnabled: issuerAssetForm.distributionsEnabled,
      requiresAuthorizedTrustlines: issuerAssetForm.requiresAuthorizedTrustlines,
      allowDistributions: issuerAssetForm.allowDistributions,
    }, 'issuer_asset_policy')
  }

  function submitIssuerHolderReview() {
    const holder = issuerHolderReviewForm.holder.trim()
    const currency = issuerHolderReviewForm.currency.trim().toUpperCase()
    const notes = issuerHolderReviewForm.notes.trim()

    if (!holder || !looksLikeClassicAddress(holder)) {
      setActionError('Enter a valid holder XRPL classic address for review.')
      return
    }
    if (!currency || isXrpCurrency(currency)) {
      setActionError('Enter a non-XRP currency code to review.')
      return
    }

    void submitAction('/api/xrpl/issuer/holder/review', {
      holder,
      currency,
      status: issuerHolderReviewForm.status,
      notes: notes || undefined,
    }, 'issuer_holder_review')
  }

  function submitIssuerAuthorize() {
    const holder = issuerAuthorizeForm.holder.trim()
    const currency = issuerAuthorizeForm.currency.trim().toUpperCase()
    if (!holder || !looksLikeClassicAddress(holder)) {
      setActionError('Enter a valid holder XRPL classic address.')
      return
    }
    if (!currency || isXrpCurrency(currency)) {
      setActionError('Enter a non-XRP currency code to authorize.')
      return
    }

    void submitAction('/api/xrpl/issuer/trustline/authorize', {
      holder,
      currency,
    }, 'trustline_authorize')
  }

  function submitIssuerPayment() {
    const destination = issuerPaymentForm.destination.trim()
    const currency = issuerPaymentForm.currency.trim().toUpperCase()
    const issuer = issuerPaymentForm.issuer.trim()
    const destinationTag = issuerPaymentForm.destinationTag.trim()

    if (!destination || !looksLikeClassicAddress(destination)) {
      setActionError('Enter a valid destination XRPL classic address.')
      return
    }
    if (!currency || isXrpCurrency(currency)) {
      setActionError('Enter a non-XRP currency code to distribute.')
      return
    }
    if (issuer && !looksLikeClassicAddress(issuer)) {
      setActionError('Issuer must be a valid XRPL classic address.')
      return
    }
    if (destinationTag && !/^\d+$/.test(destinationTag)) {
      setActionError('Destination tag must be a positive integer.')
      return
    }

    void submitAction('/api/xrpl/issuer/payment', {
      destination,
      currency,
      issuer: issuer || undefined,
      value: issuerPaymentForm.value,
      destinationTag: destinationTag ? Number(destinationTag) : undefined,
    }, 'issuer_payment')
  }

  const quickSwapSubmitDisabled =
    deskLocked ||
    regionBlocked ||
    submitting ||
    quickSwapValidationIssues.length > 0 ||
    !swapQuote ||
    !quickSwapFromAmount

  const canRetryLastAction = !deskLocked && !regionBlocked && !submitting && !!lastActionRequest
  const hasSubmissionHistory = activityRail.length > 0
  const showSubmissionRail = hasSubmissionHistory && showSubmissionLog
  const shouldShowGlobalRefresh = showLaunchContext || showExpertTools || hasSubmissionHistory
  const refreshButton = useGsapPressable<HTMLButtonElement>({
    hover: { scale: 1.02 },
    press: { scale: 0.98 },
  })

  const handleRefreshVisibleData = () => {
    const refreshes: Array<Promise<unknown>> = [loadSwapQuote({ revealMissingQuote: true })]
    if (!deskLocked && (showLaunchContext || showExpertTools)) {
      refreshes.push(loadAssets(), loadHistory())
    }
    if (!deskLocked && showExpertTools) {
      refreshes.push(loadNfts(), loadOrderbook())
    }
    void Promise.all(refreshes)
  }

  const handleRetryLastAction = () => {
    if (!lastActionRequest) return
    void submitAction(lastActionRequest.path, lastActionRequest.payload, `${lastActionRequest.actionName}_retry`)
  }

  const handleCopyTxHash = async (txHash: string) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(txHash)
        setActionMessage(`Copied tx hash ${shortHash(txHash)}`)
        setActionError(null)
      }
    } catch {
      setActionError('Unable to copy tx hash to clipboard.')
    }
  }

  const handleQuickSwapSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (quickSwapSubmitDisabled || !swapQuote || !quickSwapFromAmount) return

    void submitAction(
      '/api/xrpl/trade/swap',
      {
        sourceAmount: {
          currency: quickSwapFromCode,
          issuer: quickSwapFromIsXrp ? undefined : swapQuote.sourceAmount.issuer,
          value: quickSwapForm.fromValue.trim(),
        },
        destinationAsset: {
          currency: quickSwapToCode,
          issuer: quickSwapToIsXrp ? undefined : swapQuote.destinationAmount.issuer,
        },
        slippageBps: swapQuote.slippageBps,
      },
      'swap_payment',
    )
  }

  const renderDeskUtilities = () => (
    <div className="space-y-3">
      {shouldShowGlobalRefresh ? (
        <button
          ref={refreshButton.ref}
          data-testid="xrpl-trade-desk-refresh"
          type="button"
          onPointerEnter={refreshButton.onPointerEnter}
          onPointerLeave={refreshButton.onPointerLeave}
          onPointerDown={refreshButton.onPointerDown}
          onPointerUp={refreshButton.onPointerUp}
          onPointerCancel={refreshButton.onPointerCancel}
          onBlur={refreshButton.onBlur}
          disabled={deskLocked || submitting || swapQuoteLoading || offersLoading}
          onClick={handleRefreshVisibleData}
          aria-describedby={regionBlocked ? regionPolicyId : undefined}
          className="inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-[#6f96c9] via-[#5b86a8] to-[#4b9577] px-5 py-3 text-base font-semibold tracking-wide text-white shadow-lg shadow-[#4b9577]/30 transition disabled:cursor-not-allowed disabled:opacity-60"
        >
          Refresh trade data
        </button>
      ) : null}

      {hasSubmissionHistory ? (
        <button
          data-testid="xrpl-trade-desk-log-toggle"
          type="button"
          onClick={() => setShowSubmissionLog((open) => !open)}
          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-ivory/85 transition hover:bg-white/10"
        >
          {showSubmissionRail ? 'Hide submission log' : `Show submission log (${activityRail.length})`}
        </button>
      ) : null}

      {authLocked ? (
        <div data-testid="xrpl-trade-desk-unlock">
          <UnlockActionsLink
            className="text-xs uppercase tracking-[0.18em] text-ivory/50"
          />
        </div>
      ) : null}
      {!authLocked && !walletReady ? (
        <p data-testid="xrpl-trade-desk-wallet-lock" className="text-sm text-ivory/60">
          Create or connect a wallet to unlock the trade desk.
        </p>
      ) : null}
      {actionMessage ? (
        <p
          id={actionStatusId}
          data-testid="xrpl-trade-desk-action-status"
          role="status"
          aria-live="polite"
          className="text-sm text-jade"
        >
          {actionMessage}
        </p>
      ) : null}
      {actionError ? (
        <p
          id={actionErrorId}
          data-testid="xrpl-trade-desk-action-error"
          role="alert"
          className="text-sm text-red-300"
        >
          {actionError}
        </p>
      ) : null}
    </div>
  )

  const renderSubmissionRail = (className = 'surface-inner h-fit space-y-3 p-4 xl:sticky xl:top-24') =>
    showSubmissionRail ? (
      <aside
        data-testid="xrpl-trade-desk-activity-rail"
        className={className}
        aria-label="Trade desk submission log"
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs uppercase tracking-[0.16em] text-ivory/55">Submission Log</p>
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-ivory/70">
            {networkConfig.id}
          </span>
        </div>
        <p className="text-xs text-ivory/60">
          Pending, successful, and failed transactions show up here after you submit.
        </p>
        <button
          data-testid="xrpl-trade-desk-retry-last-action"
          type="button"
          onClick={handleRetryLastAction}
          disabled={!canRetryLastAction}
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-ivory/80 disabled:opacity-50"
        >
          Retry last action
        </button>
        <div className="max-h-[460px] space-y-2 overflow-y-auto pr-1">
          {activityRail.map((item) => (
            <div
              key={item.id}
              data-testid="xrpl-trade-desk-activity-item"
              className="rounded-xl border border-white/10 bg-black/35 p-3 text-xs text-ivory/75"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-ivory">{item.action}</p>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] ${
                    item.status === 'pending'
                      ? 'bg-amber-300/15 text-amber-100'
                      : item.status === 'success'
                        ? 'bg-jade/20 text-jade'
                        : 'bg-red-300/15 text-red-200'
                  }`}
                >
                  {item.status}
                </span>
              </div>
              <p className="mt-1 text-ivory/70">{item.message}</p>
              {item.txHash ? (
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleCopyTxHash(item.txHash!)}
                    className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-ivory/80"
                  >
                    Copy tx
                  </button>
                  <a
                    href={explorerTransactionUrl(selectedNetworkId, item.txHash)}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-ivory/80"
                  >
                    Open explorer
                  </a>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </aside>
    ) : null

  return (
    <section
      data-testid="xrpl-trade-desk"
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
            Launch with the simple path first
          </h2>
          <p id={bodyId} className="text-sm text-ivory/70">
            Keep the desk calm for v1: one swap flow up front, with the noisier XRPL controls tucked away until you
            are ready to release them.
          </p>
          <p className="mt-1 text-xs text-ivory/55">
            Trustlines, raw order-book filters, and NFT actions are still here, but muted behind a separate reveal.
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-[0.16em] text-ivory/50">Region / Network</p>
          <div className="mt-1 flex items-center justify-end gap-2">
            <span className="rounded-full border border-white/12 bg-white/5 px-3 py-1 text-[11px] font-semibold tracking-[0.12em] text-ivory/80">
              {region.toUpperCase()}
            </span>
            <span
              data-testid="xrpl-trade-desk-network-badge"
              className={`rounded-full border px-3 py-1 text-[11px] font-semibold tracking-[0.12em] ${
                networkConfig.isProduction
                  ? 'border-amber-300/40 bg-amber-200/10 text-amber-100'
                  : 'border-jade/35 bg-jade/15 text-jade'
              }`}
            >
              {networkConfig.name}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-ivory/55">Fee est. ~{networkFeeEstimateXrp} XRP / tx</p>
          {regionBlocked ? (
            <p id={regionPolicyId} className="mt-1 text-xs text-amber-200">
              Trading disabled by region policy.
            </p>
          ) : null}
        </div>
      </header>

      <div className="relative mt-5 flex flex-wrap items-center gap-2">
        <button
          data-testid="xrpl-trade-desk-context-toggle"
          type="button"
          disabled={deskLocked}
          aria-expanded={showLaunchContext && !showExpertTools}
          onClick={() => {
            setShowLaunchContext((open) => !open)
            setShowExpertTools(false)
          }}
          className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition disabled:cursor-not-allowed disabled:opacity-60 ${
            showLaunchContext && !showExpertTools
              ? 'border-saffron/45 bg-saffron/20 text-saffron'
              : 'border-white/12 bg-white/5 text-ivory/70 hover:border-white/20 hover:text-ivory/90'
          }`}
        >
          {showLaunchContext && !showExpertTools ? 'Hide balances' : 'Show balances'}
        </button>
        <button
          data-testid="xrpl-trade-desk-expert-toggle"
          type="button"
          disabled={deskLocked}
          aria-expanded={showExpertTools}
          onClick={() => setShowExpertTools(true)}
          className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition disabled:cursor-not-allowed disabled:opacity-60 ${
            showExpertTools
              ? 'border-saffron/45 bg-saffron/20 text-saffron'
              : 'border-white/12 bg-white/5 text-ivory/70 hover:border-white/20 hover:text-ivory/90'
          }`}
        >
          {showExpertTools ? 'Advanced open' : 'Open advanced desk'}
        </button>
        <p className="text-xs text-ivory/50">
          Keep the main desk focused on swaps. Open the full XRPL workspace only when you need deeper controls.
        </p>
      </div>

      <div
        className={`relative mt-6 grid gap-5 ${
          showSubmissionRail && !showExpertTools ? 'xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.42fr)]' : ''
        }`}
      >
        <div className="space-y-5">
          <>
            <div className="surface-inner rounded-[2rem] border border-saffron/15 bg-gradient-to-br from-[#f1d8ab]/10 via-transparent to-[#4b7c79]/10 p-5">
              <p className="text-xs uppercase tracking-[0.16em] text-saffron/75">Launch View</p>
              <h3 className="mt-2 text-xl font-semibold text-ivory">One swap flow, nothing extra</h3>
              <p className="mt-2 max-w-2xl text-sm text-ivory/70">
                Start here: enter the asset you want to spend, check the quote, and submit the trade. Everything else
                stays muted until you open it on purpose.
              </p>
            </div>

            <div className="surface-inner rounded-[1.5rem] border border-amber-300/25 bg-amber-300/10 p-4 text-sm text-amber-100/90">
              Trades here submit through the server-configured XRPL signer for {networkConfig.name}. It is separate
              from the `0x` vault shown in the session card above.
            </div>

            <form
              data-testid="xrpl-trade-desk-quick-swap-form"
              className="surface-inner space-y-4 p-5"
              aria-labelledby="xrpl-trade-desk-quick-swap-title"
              aria-describedby={regionBlocked ? regionPolicyId : undefined}
              onSubmit={handleQuickSwapSubmit}
            >
              <fieldset disabled={deskLocked} className="space-y-4 disabled:opacity-60">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p id="xrpl-trade-desk-quick-swap-title" className="text-xs uppercase tracking-[0.16em] text-ivory/55">
                    Simple Swap
                  </p>
                  <p className="mt-1 text-sm text-ivory/65">
                    Pick the asset you want to spend, then the asset you want back.
                  </p>
                </div>
                <button
                  data-testid="xrpl-trade-desk-quick-swap-refresh-quote"
                  type="button"
                  onClick={() => void loadSwapQuote({ revealMissingQuote: true })}
                  disabled={deskLocked || swapQuoteLoading}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-ivory/70 disabled:opacity-60"
                >
                  Refresh quote
                </button>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-xs uppercase tracking-[0.14em] text-ivory/50">You pay</p>
                  <select
                    data-testid="xrpl-trade-desk-quick-swap-from-currency"
                    value={quickSwapForm.fromCurrency}
                    onChange={(event) => {
                      const currency = event.target.value
                      setQuickSwapForm((prev) => ({
                        ...prev,
                        fromCurrency: currency,
                      }))
                    }}
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory"
                    aria-label="Quick swap from currency"
                  >
                    {TRADE_CURRENCY_OPTIONS.map((option) => (
                      <option key={`quick-from-${option.code}`} value={option.code} className="bg-black text-ivory">
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-ivory/55">
                    {quickSwapFromIsXrp
                      ? 'XRP is native, so there is no issuer on the spend side.'
                      : `We will auto-pick a trusted ${quickSwapFromCode} issuer from the wallet policy.`}
                  </p>
                  <input
                    data-testid="xrpl-trade-desk-quick-swap-from-value"
                    value={quickSwapForm.fromValue}
                    onChange={(event) => setQuickSwapForm((prev) => ({ ...prev, fromValue: event.target.value }))}
                    placeholder="Amount to spend"
                    aria-label="Quick swap from amount"
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory"
                  />
                </div>

                <div className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-xs uppercase tracking-[0.14em] text-ivory/50">You receive</p>
                  <select
                    data-testid="xrpl-trade-desk-quick-swap-to-currency"
                    value={quickSwapForm.toCurrency}
                    onChange={(event) => {
                      const currency = event.target.value
                      setQuickSwapForm((prev) => ({
                        ...prev,
                        toCurrency: currency,
                      }))
                    }}
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory"
                    aria-label="Quick swap to currency"
                  >
                    {TRADE_CURRENCY_OPTIONS.map((option) => (
                      <option key={`quick-to-${option.code}`} value={option.code} className="bg-black text-ivory">
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-ivory/55">
                    {quickSwapToIsXrp
                      ? 'XRP is native, so there is no issuer on the receive side.'
                      : `We will auto-pick the best trusted ${quickSwapToCode} route that matches this wallet.`}
                  </p>
                  <div
                    data-testid="xrpl-trade-desk-quick-swap-preview"
                    className="rounded-2xl border border-white/10 bg-black/30 p-3 text-sm text-ivory/75"
                  >
                    <p className="text-xs uppercase tracking-[0.14em] text-ivory/50">Preview</p>
                    <p className="mt-2">
                      Estimated receive:{' '}
                      <span className="font-semibold text-ivory">
                        {quickSwapEstimatedReceive ? `${formatPreviewAmount(quickSwapEstimatedReceive)} ${quickSwapToCode}` : '--'}
                      </span>
                    </p>
                    <p className="mt-1">
                      Minimum receive:{' '}
                      <span className="font-semibold text-ivory">
                        {quickSwapDeliverMin ? `${formatPreviewAmount(quickSwapDeliverMin)} ${quickSwapToCode}` : '--'}
                      </span>
                    </p>
                    <p className="mt-1">
                      Network fee:{' '}
                      <span className="font-semibold text-ivory">~{networkFeeEstimateXrp} XRP</span>
                    </p>
                    <p className="mt-1 text-xs text-ivory/55">
                      {quickSwapStatusHint}
                    </p>
                    {swapQuote ? (
                      <p className="mt-1 text-xs text-ivory/55">
                        {swapQuote.quoteMode === 'public' ? 'Quote route' : 'Trusted route'}: {quickSwapRouteSummary}
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-ivory/55">
                      {swapQuote
                        ? swapQuote.quoteMode === 'public'
                          ? swapQuote.routeKind === 'multi_hop'
                            ? `Using public XRPL liquidity across ${swapQuote.hops?.length ?? 0} legs with a ${formatPreviewAmount(swapQuote.slippageBps / 100)}% minimum-receive estimate.`
                            : `Using public XRPL ${swapQuote.liquiditySource ?? 'liquidity'} data with a ${formatPreviewAmount(swapQuote.slippageBps / 100)}% minimum-receive estimate.`
                          : `Using XRPL pathfinding with a ${formatPreviewAmount(swapQuote.slippageBps / 100)}% minimum-receive guard.`
                        : `Quotes on ${networkConfig.name} search public XRPL liquidity first, then wallet-aware routing when available.`}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/25 p-3 text-xs text-ivory/65">
                Simple swap uses trusted issuer policy behind the scenes. XRP stays native; issued assets such as EUR,
                USD, JPY, and XAU are resolved automatically from trusted issuers and live liquidity on {networkConfig.name}.
                Wallet-aware routing improves execution, but public quotes no longer depend on trustlines or funded
                account state.
              </div>

              {quickSwapValidationIssues.length > 0 ? (
                <div data-testid="xrpl-trade-desk-quick-swap-validation" className="rounded-xl border border-red-300/25 bg-red-300/10 p-3 text-xs text-red-200">
                  <ul className="space-y-1">
                    {quickSwapValidationIssues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="rounded-2xl border border-white/10 bg-black/25 p-3 text-xs text-ivory/65">
                Need more than a basic swap? Reveal expert tools only when you are ready.
              </div>

              <button
                data-testid="xrpl-trade-desk-quick-swap-submit"
                type="submit"
                disabled={quickSwapSubmitDisabled}
                className="inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-[#7fb0d9] via-[#5c8db4] to-[#4b7c79] px-5 py-3 text-base font-semibold tracking-wide text-white shadow-lg shadow-[#4b7c79]/30 transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                Submit simple swap
              </button>
              </fieldset>
            </form>

            {showLaunchContext && !showExpertTools ? (
              <div data-testid="xrpl-trade-desk-launch-context" className="surface-inner space-y-3 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-ivory/55">Wallet Balances</p>
                    <p className="mt-1 text-xs text-ivory/55">Useful context when you need it, hidden by default for launch.</p>
                  </div>
                  <button
                    data-testid="xrpl-trade-desk-assets-refresh"
                    type="button"
                    disabled={deskLocked}
                    onClick={() => void loadAssets()}
                    aria-label="Refresh wallet balances"
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-ivory/70 disabled:opacity-60"
                  >
                    Refresh
                  </button>
                </div>
                {assetsLoading ? <p className="text-sm text-ivory/60">Loading balances...</p> : null}
                {assetsError ? <p className="text-sm text-red-300">{assetsError}</p> : null}
                {!assetsLoading && !assetsError ? (
                  <div className="space-y-2">
                    {assets.slice(0, 6).map((asset) => (
                      <div
                        key={`${asset.currency}-${asset.issuer ?? 'xrp'}`}
                        data-testid="xrpl-trade-desk-asset-row"
                        className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
                      >
                        <p className="font-semibold text-ivory">
                          {asset.currency} {asset.assetType === 'issued' && asset.issuer ? `· ${shortHash(asset.issuer)}` : ''}
                        </p>
                        <p className="text-ivory/60">{asset.value}</p>
                      </div>
                    ))}
                    {assets.length === 0 ? <p className="text-sm text-ivory/55">No balances found.</p> : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            {showExpertTools ? (
              <div
                data-testid="xrpl-trade-desk-advanced-overlay"
                className="fixed inset-0 z-[80] bg-black/78 px-3 py-3 backdrop-blur-sm sm:px-4 sm:py-4 lg:px-6 lg:py-6"
              >
                <div
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="xrpl-trade-desk-advanced-title"
                  className="surface-panel panel-glow-jade relative flex h-full flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-[#061018]/96"
                >
                  <div className="absolute inset-x-10 top-6 ornament-line" />
                  <div className="relative flex items-start justify-between gap-4 border-b border-white/10 px-5 pb-4 pt-5 sm:px-6">
                    <div className="max-w-2xl">
                      <p className="text-xs uppercase tracking-[0.16em] text-saffron/75">Advanced Desk</p>
                      <h3 id="xrpl-trade-desk-advanced-title" className="mt-2 text-2xl font-semibold text-ivory">
                        Full XRPL workspace
                      </h3>
                      <p className="mt-2 text-sm text-ivory/70">
                        Raw order book, trustlines, NFT actions, and ledger history live here so the main desk can
                        stay focused on the simple swap path.
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className={`rounded-full border px-3 py-1 text-[11px] font-semibold tracking-[0.12em] ${
                          networkConfig.isProduction
                            ? 'border-amber-300/40 bg-amber-200/10 text-amber-100'
                            : 'border-jade/35 bg-jade/15 text-jade'
                        }`}
                      >
                        {networkConfig.name}
                      </span>
                      <button
                        data-testid="xrpl-trade-desk-advanced-close"
                        type="button"
                        onClick={() => setShowExpertTools(false)}
                        className="rounded-full border border-white/12 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-ivory/80 transition hover:border-white/20 hover:bg-white/10"
                      >
                        Close
                      </button>
                    </div>
                  </div>

                  <div
                    className={`relative flex-1 overflow-y-auto px-5 pb-5 pt-5 sm:px-6 ${
                      showSubmissionRail ? 'xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.42fr)] xl:gap-5' : ''
                    }`}
                  >
                    <div className="space-y-5">
                <div className="surface-inner rounded-[2rem] border border-white/10 bg-black/20 p-5">
                  <p className="text-xs uppercase tracking-[0.16em] text-saffron/75">Expert Mode</p>
                  <h3 className="mt-2 text-xl font-semibold text-ivory">Raw XRPL controls</h3>
                  <p className="mt-2 text-sm text-ivory/70">
                    Use this only for trustlines, direct offer management, or NFT actions. The simple swap path stays
                    the safer launch default.
                  </p>
                </div>

                <div className="grid gap-5 lg:grid-cols-2">
                  <div data-testid="xrpl-trade-desk-assets" className="surface-inner space-y-3 p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-xs uppercase tracking-[0.16em] text-ivory/55">Wallet Balances</p>
                      <button
                        data-testid="xrpl-trade-desk-assets-refresh"
                        type="button"
                        disabled={deskLocked}
                        onClick={() => void loadAssets()}
                        aria-label="Refresh wallet balances"
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-ivory/70 disabled:opacity-60"
                      >
                        Refresh
                      </button>
                    </div>
                    {assetsLoading ? <p className="text-sm text-ivory/60">Loading balances...</p> : null}
                    {assetsError ? <p className="text-sm text-red-300">{assetsError}</p> : null}
                    {!assetsLoading && !assetsError ? (
                      <div className="space-y-2">
                        {assets.slice(0, 10).map((asset) => (
                          <div
                            key={`${asset.currency}-${asset.issuer ?? 'xrp'}`}
                            data-testid="xrpl-trade-desk-asset-row"
                            className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
                          >
                            <p className="font-semibold text-ivory">
                              {asset.currency} {asset.assetType === 'issued' && asset.issuer ? `· ${shortHash(asset.issuer)}` : ''}
                            </p>
                            <p className="text-ivory/60">{asset.value}</p>
                          </div>
                        ))}
                        {assets.length === 0 ? <p className="text-sm text-ivory/55">No balances found.</p> : null}
                      </div>
                    ) : null}
                  </div>

                  <div data-testid="xrpl-trade-desk-orderbook" className="surface-inner space-y-3 p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-xs uppercase tracking-[0.16em] text-ivory/55">Raw Order Book</p>
                      <button
                        data-testid="xrpl-trade-desk-orderbook-refresh"
                        type="button"
                        disabled={offersLoading}
                        onClick={() => void loadOrderbook()}
                        aria-label="Refresh order book"
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-ivory/70 disabled:opacity-60"
                      >
                        Refresh
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                    <select
                      data-testid="xrpl-trade-desk-orderbook-taker-gets-currency"
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
                      data-testid="xrpl-trade-desk-orderbook-taker-gets-issuer"
                      value={pair.takerGetsIssuer}
                      onChange={(event) => setPair((prev) => ({ ...prev, takerGetsIssuer: event.target.value }))}
                      disabled={isXrpCurrency(pair.takerGetsCurrency)}
                      aria-label="Order book taker gets issuer"
                      className="rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-ivory disabled:cursor-not-allowed disabled:opacity-50"
                      placeholder={isXrpCurrency(pair.takerGetsCurrency) ? 'No issuer for XRP' : 'Gets issuer'}
                    />
                    <select
                      data-testid="xrpl-trade-desk-orderbook-taker-pays-currency"
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
                      data-testid="xrpl-trade-desk-orderbook-taker-pays-issuer"
                      value={pair.takerPaysIssuer}
                      onChange={(event) => setPair((prev) => ({ ...prev, takerPaysIssuer: event.target.value }))}
                      disabled={isXrpCurrency(pair.takerPaysCurrency)}
                      aria-label="Order book taker pays issuer"
                      className="rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-ivory disabled:cursor-not-allowed disabled:opacity-50"
                      placeholder={isXrpCurrency(pair.takerPaysCurrency) ? 'No issuer for XRP' : 'Pays issuer'}
                    />
                  </div>
                    {offersLoading ? <p className="text-sm text-ivory/60">Loading order book...</p> : null}
                    {offersError ? <p className="text-sm text-red-300">{offersError}</p> : null}
                    {!offersLoading && !offersError ? (
                      <div className="space-y-2">
                        {offers.slice(0, 6).map((offer) => (
                          <div
                            key={`${offer.account ?? 'na'}-${offer.sequence ?? 0}`}
                            data-testid="xrpl-trade-desk-orderbook-row"
                            className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-ivory/75"
                          >
                            <p>Seq {offer.sequence ?? '--'} · {shortHash(offer.account)}</p>
                            <p>Quality: {offer.quality ?? '--'}</p>
                          </div>
                        ))}
                        {offers.length === 0 ? <p className="text-sm text-ivory/55">No orderbook entries.</p> : null}
                      </div>
                    ) : null}
                  </div>

                  <div data-testid="xrpl-trade-desk-nfts" className="surface-inner space-y-3 p-4 lg:col-span-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs uppercase tracking-[0.16em] text-ivory/55">Wallet NFTs</p>
                      <button
                        data-testid="xrpl-trade-desk-nfts-refresh"
                        type="button"
                        disabled={deskLocked}
                      onClick={() => void loadNfts()}
                      aria-label="Refresh wallet NFTs"
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
                          <div
                            key={nft.nftokenId ?? `nft-${index}`}
                            data-testid="xrpl-trade-desk-nft-card"
                            className="rounded-xl border border-white/10 bg-black/30 p-3"
                          >
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

                  <div data-testid="xrpl-trade-desk-history" className="surface-inner space-y-3 p-4 lg:col-span-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs uppercase tracking-[0.16em] text-ivory/55">Recent Ledger Actions</p>
                    <button
                      data-testid="xrpl-trade-desk-history-refresh"
                      type="button"
                      disabled={deskLocked}
                      onClick={() => void loadHistory()}
                      aria-label="Refresh recent ledger actions"
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-ivory/70 disabled:opacity-60"
                    >
                      Refresh
                    </button>
                  </div>
                  {historyLoading ? <p className="text-sm text-ivory/60">Loading recent actions...</p> : null}
                  {historyError ? <p className="text-sm text-red-300">{historyError}</p> : null}
                  {!historyLoading && !historyError ? (
                    <div className="space-y-2">
                      {history.slice(0, 10).map((item) => (
                        <div
                          key={item.id}
                          data-testid="xrpl-trade-desk-history-row"
                          className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-ivory/75"
                        >
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

                <div className="grid gap-4 lg:grid-cols-2">
                <form
                  data-testid="xrpl-trade-desk-trustline-form"
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
                    data-testid="xrpl-trade-desk-trustline-issuer"
                    value={trustlineForm.issuer}
                    onChange={(event) => setTrustlineForm((prev) => ({ ...prev, issuer: event.target.value }))}
                    aria-label="Trustline issuer address"
                    placeholder="Issuer address"
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      data-testid="xrpl-trade-desk-trustline-currency"
                      value={trustlineForm.currency}
                      onChange={(event) => setTrustlineForm((prev) => ({ ...prev, currency: event.target.value }))}
                      list="xrpl-issued-currency-options"
                      className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory"
                      aria-label="Trustline currency"
                      placeholder="Currency"
                    />
                    <input
                      data-testid="xrpl-trade-desk-trustline-limit"
                      value={trustlineForm.limit}
                      onChange={(event) => setTrustlineForm((prev) => ({ ...prev, limit: event.target.value }))}
                      aria-label="Trustline limit"
                      placeholder="Limit"
                      className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory"
                    />
                  </div>
                  <button
                    data-testid="xrpl-trade-desk-trustline-submit"
                    type="submit"
                    disabled={deskLocked || regionBlocked || submitting}
                    className="rounded-xl bg-gradient-to-r from-[#6f96c9] via-[#5b86a8] to-[#4b9577] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    Submit Trustline
                  </button>
                </form>

                <form
                  data-testid="xrpl-trade-desk-issuer-asset-form"
                  className="surface-inner space-y-3 p-4"
                  aria-labelledby="xrpl-trade-desk-issuer-asset-title"
                  aria-describedby={regionBlocked ? regionPolicyId : undefined}
                  onSubmit={(event) => {
                    event.preventDefault()
                    submitIssuerAssetPolicy()
                  }}
                >
                  <p id="xrpl-trade-desk-issuer-asset-title" className="text-xs uppercase tracking-[0.16em] text-ivory/55">
                    Register Issuer Asset
                  </p>
                  <p className="text-xs text-ivory/55">
                    Start here. This creates the app-level policy record that later approval, authorization, and
                    distribution steps enforce.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      data-testid="xrpl-trade-desk-issuer-asset-currency"
                      value={issuerAssetForm.currency}
                      onChange={(event) => setIssuerAssetForm((prev) => ({ ...prev, currency: event.target.value }))}
                      list="xrpl-issued-currency-options"
                      aria-label="Issuer asset currency"
                      placeholder="Currency"
                      className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory"
                    />
                    <input
                      data-testid="xrpl-trade-desk-issuer-asset-display-name"
                      value={issuerAssetForm.displayName}
                      onChange={(event) => setIssuerAssetForm((prev) => ({ ...prev, displayName: event.target.value }))}
                      aria-label="Issuer asset display name"
                      placeholder="Display name"
                      className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory"
                    />
                    <input
                      data-testid="xrpl-trade-desk-issuer-asset-trustline-limit"
                      value={issuerAssetForm.trustlineLimit}
                      onChange={(event) => setIssuerAssetForm((prev) => ({ ...prev, trustlineLimit: event.target.value }))}
                      aria-label="Issuer asset trustline limit"
                      placeholder="Trustline limit (optional)"
                      className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory"
                    />
                    <input
                      data-testid="xrpl-trade-desk-issuer-asset-max-distribution"
                      value={issuerAssetForm.maxDistributionValue}
                      onChange={(event) => setIssuerAssetForm((prev) => ({ ...prev, maxDistributionValue: event.target.value }))}
                      aria-label="Issuer asset max distribution value"
                      placeholder="Max distribution (optional)"
                      className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory"
                    />
                    <select
                      data-testid="xrpl-trade-desk-issuer-asset-status"
                      value={issuerAssetForm.assetStatus}
                      onChange={(event) => setIssuerAssetForm((prev) => ({ ...prev, assetStatus: event.target.value }))}
                      aria-label="Issuer asset status"
                      className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory"
                    >
                      {ISSUER_POLICY_STATUS_OPTIONS.map((option) => (
                        <option key={`issuer-asset-status-${option.value}`} value={option.value} className="bg-black text-ivory">
                          Asset: {option.label}
                        </option>
                      ))}
                    </select>
                    <select
                      data-testid="xrpl-trade-desk-issuer-program-status"
                      value={issuerAssetForm.programStatus}
                      onChange={(event) => setIssuerAssetForm((prev) => ({ ...prev, programStatus: event.target.value }))}
                      aria-label="Issuer program status"
                      className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory"
                    >
                      {ISSUER_POLICY_STATUS_OPTIONS.map((option) => (
                        <option key={`issuer-program-status-${option.value}`} value={option.value} className="bg-black text-ivory">
                          Program: {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs text-ivory/75">
                      <input
                        data-testid="xrpl-trade-desk-issuer-asset-require-holder-approval"
                        type="checkbox"
                        checked={issuerAssetForm.requireHolderApproval}
                        onChange={(event) => setIssuerAssetForm((prev) => ({ ...prev, requireHolderApproval: event.target.checked }))}
                      />
                      Require holder approval
                    </label>
                    <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs text-ivory/75">
                      <input
                        data-testid="xrpl-trade-desk-issuer-asset-distributions-enabled"
                        type="checkbox"
                        checked={issuerAssetForm.distributionsEnabled}
                        onChange={(event) => setIssuerAssetForm((prev) => ({ ...prev, distributionsEnabled: event.target.checked }))}
                      />
                      Asset distributions enabled
                    </label>
                    <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs text-ivory/75">
                      <input
                        data-testid="xrpl-trade-desk-issuer-asset-requires-authorized-trustlines"
                        type="checkbox"
                        checked={issuerAssetForm.requiresAuthorizedTrustlines}
                        onChange={(event) => setIssuerAssetForm((prev) => ({ ...prev, requiresAuthorizedTrustlines: event.target.checked }))}
                      />
                      Require authorized trustlines
                    </label>
                    <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs text-ivory/75">
                      <input
                        data-testid="xrpl-trade-desk-issuer-asset-allow-distributions"
                        type="checkbox"
                        checked={issuerAssetForm.allowDistributions}
                        onChange={(event) => setIssuerAssetForm((prev) => ({ ...prev, allowDistributions: event.target.checked }))}
                      />
                      Program distributions enabled
                    </label>
                  </div>
                  <p className="text-xs text-ivory/50">
                    Typical order: register the asset, approve holders, authorize trustlines, then distribute.
                  </p>
                  <button
                    data-testid="xrpl-trade-desk-issuer-asset-submit"
                    type="submit"
                    disabled={deskLocked || regionBlocked || submitting}
                    className="rounded-xl bg-gradient-to-r from-[#5e91b8] via-[#4c7699] to-[#35536f] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    Save Asset Policy
                  </button>
                </form>

                <form
                  data-testid="xrpl-trade-desk-issuer-holder-review-form"
                  className="surface-inner space-y-3 p-4"
                  aria-labelledby="xrpl-trade-desk-issuer-holder-review-title"
                  aria-describedby={regionBlocked ? regionPolicyId : undefined}
                  onSubmit={(event) => {
                    event.preventDefault()
                    submitIssuerHolderReview()
                  }}
                >
                  <p id="xrpl-trade-desk-issuer-holder-review-title" className="text-xs uppercase tracking-[0.16em] text-ivory/55">
                    Review Holder Eligibility
                  </p>
                  <p className="text-xs text-ivory/55">
                    This is the off-ledger compliance step. Approve the holder here before submitting on-ledger
                    authorization.
                  </p>
                  <input
                    data-testid="xrpl-trade-desk-issuer-holder-review-holder"
                    value={issuerHolderReviewForm.holder}
                    onChange={(event) => setIssuerHolderReviewForm((prev) => ({ ...prev, holder: event.target.value }))}
                    aria-label="Issuer holder review address"
                    placeholder="Holder classic address"
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      data-testid="xrpl-trade-desk-issuer-holder-review-currency"
                      value={issuerHolderReviewForm.currency}
                      onChange={(event) => setIssuerHolderReviewForm((prev) => ({ ...prev, currency: event.target.value }))}
                      list="xrpl-issued-currency-options"
                      aria-label="Issuer holder review currency"
                      placeholder="Currency"
                      className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory"
                    />
                    <select
                      data-testid="xrpl-trade-desk-issuer-holder-review-status"
                      value={issuerHolderReviewForm.status}
                      onChange={(event) => setIssuerHolderReviewForm((prev) => ({ ...prev, status: event.target.value }))}
                      aria-label="Issuer holder review status"
                      className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory"
                    >
                      {ISSUER_HOLDER_REVIEW_STATUS_OPTIONS.map((option) => (
                        <option key={`issuer-holder-review-${option.value}`} value={option.value} className="bg-black text-ivory">
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <textarea
                    data-testid="xrpl-trade-desk-issuer-holder-review-notes"
                    value={issuerHolderReviewForm.notes}
                    onChange={(event) => setIssuerHolderReviewForm((prev) => ({ ...prev, notes: event.target.value }))}
                    aria-label="Issuer holder review notes"
                    placeholder="Notes for the audit trail (optional)"
                    rows={3}
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory"
                  />
                  <button
                    data-testid="xrpl-trade-desk-issuer-holder-review-submit"
                    type="submit"
                    disabled={deskLocked || regionBlocked || submitting}
                    className="rounded-xl bg-gradient-to-r from-[#7a8fb6] via-[#5f7398] to-[#495572] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    Save Holder Review
                  </button>
                </form>

                <form
                  data-testid="xrpl-trade-desk-issuer-account-set-form"
                  className="surface-inner space-y-3 p-4"
                  aria-labelledby="xrpl-trade-desk-issuer-account-set-title"
                  aria-describedby={regionBlocked ? regionPolicyId : undefined}
                  onSubmit={(event) => {
                    event.preventDefault()
                    submitIssuerAccountSet()
                  }}
                >
                  <p id="xrpl-trade-desk-issuer-account-set-title" className="text-xs uppercase tracking-[0.16em] text-ivory/55">
                    Issuer Account Setup
                  </p>
                  <p className="text-xs text-ivory/55">
                    Uses the server issuer account for AccountSet changes in this environment.
                  </p>
                  <input
                    data-testid="xrpl-trade-desk-issuer-account-set-domain"
                    value={issuerAccountSetForm.domain}
                    onChange={(event) => setIssuerAccountSetForm((prev) => ({ ...prev, domain: event.target.value }))}
                    aria-label="Issuer domain"
                    placeholder="issuer.example.com"
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      data-testid="xrpl-trade-desk-issuer-account-set-transfer-fee-bps"
                      value={issuerAccountSetForm.transferFeeBps}
                      onChange={(event) => setIssuerAccountSetForm((prev) => ({ ...prev, transferFeeBps: event.target.value }))}
                      aria-label="Issuer transfer fee bps"
                      placeholder="Transfer fee bps"
                      className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory"
                    />
                    <input
                      data-testid="xrpl-trade-desk-issuer-account-set-tick-size"
                      value={issuerAccountSetForm.tickSize}
                      onChange={(event) => setIssuerAccountSetForm((prev) => ({ ...prev, tickSize: event.target.value }))}
                      aria-label="Issuer tick size"
                      placeholder="Tick size (0 or 3-15)"
                      className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory"
                    />
                    <select
                      data-testid="xrpl-trade-desk-issuer-account-set-flag"
                      value={issuerAccountSetForm.setFlag}
                      onChange={(event) => setIssuerAccountSetForm((prev) => ({ ...prev, setFlag: event.target.value }))}
                      aria-label="Issuer set flag"
                      className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory"
                    >
                      {ISSUER_ACCOUNT_FLAG_OPTIONS.map((option) => (
                        <option key={`issuer-set-flag-${option.value || 'none'}`} value={option.value} className="bg-black text-ivory">
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <select
                      data-testid="xrpl-trade-desk-issuer-account-clear-flag"
                      value={issuerAccountSetForm.clearFlag}
                      onChange={(event) => setIssuerAccountSetForm((prev) => ({ ...prev, clearFlag: event.target.value }))}
                      aria-label="Issuer clear flag"
                      className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory"
                    >
                      {ISSUER_ACCOUNT_FLAG_OPTIONS.map((option) => (
                        <option key={`issuer-clear-flag-${option.value || 'none'}`} value={option.value} className="bg-black text-ivory">
                          {option.value ? `Clear ${option.label}` : option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    data-testid="xrpl-trade-desk-issuer-account-set-submit"
                    type="submit"
                    disabled={deskLocked || regionBlocked || submitting}
                    className="rounded-xl bg-gradient-to-r from-[#8aaea1] via-[#5a8d7a] to-[#35685d] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    Submit AccountSet
                  </button>
                </form>

                <form
                  data-testid="xrpl-trade-desk-issuer-authorize-form"
                  className="surface-inner space-y-3 p-4"
                  aria-labelledby="xrpl-trade-desk-issuer-authorize-title"
                  aria-describedby={regionBlocked ? regionPolicyId : undefined}
                  onSubmit={(event) => {
                    event.preventDefault()
                    submitIssuerAuthorize()
                  }}
                >
                  <p id="xrpl-trade-desk-issuer-authorize-title" className="text-xs uppercase tracking-[0.16em] text-ivory/55">
                    Authorize Holder
                  </p>
                  <p className="text-xs text-ivory/55">
                    Use this after enabling Require Auth if holders must be allow-listed before they can hold your token.
                  </p>
                  <input
                    data-testid="xrpl-trade-desk-issuer-authorize-holder"
                    value={issuerAuthorizeForm.holder}
                    onChange={(event) => setIssuerAuthorizeForm((prev) => ({ ...prev, holder: event.target.value }))}
                    aria-label="Holder address"
                    placeholder="Holder classic address"
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory"
                  />
                  <input
                    data-testid="xrpl-trade-desk-issuer-authorize-currency"
                    value={issuerAuthorizeForm.currency}
                    onChange={(event) => setIssuerAuthorizeForm((prev) => ({ ...prev, currency: event.target.value }))}
                    list="xrpl-issued-currency-options"
                    aria-label="Authorized currency"
                    placeholder="Currency"
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory"
                  />
                  <button
                    data-testid="xrpl-trade-desk-issuer-authorize-submit"
                    type="submit"
                    disabled={deskLocked || regionBlocked || submitting}
                    className="rounded-xl bg-gradient-to-r from-[#6e9dc0] via-[#507aa1] to-[#355778] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    Authorize Trustline
                  </button>
                </form>

                <form
                  data-testid="xrpl-trade-desk-issuer-payment-form"
                  className="surface-inner space-y-3 p-4"
                  aria-labelledby="xrpl-trade-desk-issuer-payment-title"
                  aria-describedby={regionBlocked ? regionPolicyId : undefined}
                  onSubmit={(event) => {
                    event.preventDefault()
                    submitIssuerPayment()
                  }}
                >
                  <p id="xrpl-trade-desk-issuer-payment-title" className="text-xs uppercase tracking-[0.16em] text-ivory/55">
                    Distribute Issued Asset
                  </p>
                  <p className="text-xs text-ivory/55">
                    Leaves the payment sender on the distributor account and defaults the issued amount issuer to the
                    configured issuer account.
                  </p>
                  <input
                    data-testid="xrpl-trade-desk-issuer-payment-destination"
                    value={issuerPaymentForm.destination}
                    onChange={(event) => setIssuerPaymentForm((prev) => ({ ...prev, destination: event.target.value }))}
                    aria-label="Issuer payment destination"
                    placeholder="Destination classic address"
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      data-testid="xrpl-trade-desk-issuer-payment-currency"
                      value={issuerPaymentForm.currency}
                      onChange={(event) => setIssuerPaymentForm((prev) => ({ ...prev, currency: event.target.value }))}
                      list="xrpl-issued-currency-options"
                      aria-label="Issuer payment currency"
                      placeholder="Currency"
                      className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory"
                    />
                    <input
                      data-testid="xrpl-trade-desk-issuer-payment-value"
                      value={issuerPaymentForm.value}
                      onChange={(event) => setIssuerPaymentForm((prev) => ({ ...prev, value: event.target.value }))}
                      aria-label="Issuer payment value"
                      placeholder="Amount"
                      className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory"
                    />
                    <input
                      data-testid="xrpl-trade-desk-issuer-payment-issuer"
                      value={issuerPaymentForm.issuer}
                      onChange={(event) => setIssuerPaymentForm((prev) => ({ ...prev, issuer: event.target.value }))}
                      aria-label="Issuer payment issuer override"
                      placeholder="Issuer override (optional)"
                      className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory"
                    />
                    <input
                      data-testid="xrpl-trade-desk-issuer-payment-destination-tag"
                      value={issuerPaymentForm.destinationTag}
                      onChange={(event) => setIssuerPaymentForm((prev) => ({ ...prev, destinationTag: event.target.value }))}
                      aria-label="Issuer payment destination tag"
                      placeholder="Destination tag (optional)"
                      className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory"
                    />
                  </div>
                  <button
                    data-testid="xrpl-trade-desk-issuer-payment-submit"
                    type="submit"
                    disabled={deskLocked || regionBlocked || submitting}
                    className="rounded-xl bg-gradient-to-r from-[#d6b072] via-[#c78b57] to-[#9d6136] px-4 py-2 text-sm font-semibold text-[#201205] disabled:opacity-60"
                  >
                    Send Issued Asset
                  </button>
                </form>

                <form
                  data-testid="xrpl-trade-desk-mint-form"
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
                    data-testid="xrpl-trade-desk-mint-uri"
                    value={mintForm.uri}
                    onChange={(event) => setMintForm((prev) => ({ ...prev, uri: event.target.value }))}
                    aria-label="NFT metadata URI"
                    placeholder="Metadata URI (https://... or ipfs://...)"
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory"
                  />
                  <input
                    data-testid="xrpl-trade-desk-mint-taxon"
                    value={mintForm.taxon}
                    onChange={(event) => setMintForm((prev) => ({ ...prev, taxon: event.target.value }))}
                    aria-label="NFT taxon"
                    placeholder="Taxon"
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory"
                  />
                  <button
                    data-testid="xrpl-trade-desk-mint-submit"
                    type="submit"
                    disabled={deskLocked || regionBlocked || submitting}
                    className="rounded-xl bg-gradient-to-r from-[#e0bf7f] via-[#cc945f] to-[#b26a49] px-4 py-2 text-sm font-semibold text-[#1c120a] disabled:opacity-60"
                  >
                    Mint
                  </button>
                </form>

                <form
                  data-testid="xrpl-trade-desk-offer-form"
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
                      data-testid="xrpl-trade-desk-offer-taker-gets-currency"
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
                      data-testid="xrpl-trade-desk-offer-taker-gets-issuer"
                      value={offerForm.takerGetsIssuer}
                      onChange={(event) => setOfferForm((prev) => ({ ...prev, takerGetsIssuer: event.target.value }))}
                      aria-label="Offer taker gets issuer"
                      placeholder={isXrpCurrency(offerForm.takerGetsCurrency) ? 'No issuer for XRP' : 'Gets issuer'}
                      disabled={isXrpCurrency(offerForm.takerGetsCurrency)}
                      className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    <input
                      data-testid="xrpl-trade-desk-offer-taker-gets-value"
                      value={offerForm.takerGetsValue}
                      onChange={(event) => setOfferForm((prev) => ({ ...prev, takerGetsValue: event.target.value }))}
                      aria-label="Offer taker gets value"
                      placeholder="Gets value"
                      className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory"
                    />
                    <select
                      data-testid="xrpl-trade-desk-offer-taker-pays-currency"
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
                      data-testid="xrpl-trade-desk-offer-taker-pays-issuer"
                      value={offerForm.takerPaysIssuer}
                      onChange={(event) => setOfferForm((prev) => ({ ...prev, takerPaysIssuer: event.target.value }))}
                      aria-label="Offer taker pays issuer"
                      placeholder={isXrpCurrency(offerForm.takerPaysCurrency) ? 'No issuer for XRP' : 'Pays issuer'}
                      disabled={isXrpCurrency(offerForm.takerPaysCurrency)}
                      className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    <input
                      data-testid="xrpl-trade-desk-offer-taker-pays-value"
                      value={offerForm.takerPaysValue}
                      onChange={(event) => setOfferForm((prev) => ({ ...prev, takerPaysValue: event.target.value }))}
                      aria-label="Offer taker pays value"
                      placeholder="Pays value"
                      className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory"
                    />
                  </div>
                  <button
                    data-testid="xrpl-trade-desk-offer-submit"
                    type="submit"
                    disabled={deskLocked || regionBlocked || submitting}
                    className="rounded-xl bg-gradient-to-r from-[#7fb0d9] via-[#5c8db4] to-[#4b7c79] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    Create Offer
                  </button>
                  <div className="flex items-center gap-2">
                    <input
                      data-testid="xrpl-trade-desk-offer-cancel-sequence"
                      value={offerCancelSequence}
                      onChange={(event) => setOfferCancelSequence(event.target.value)}
                      aria-label="Offer sequence to cancel"
                      placeholder="Offer sequence to cancel"
                      className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory"
                    />
                    <button
                      data-testid="xrpl-trade-desk-offer-cancel"
                      type="button"
                      disabled={deskLocked || regionBlocked || submitting || !offerCancelSequence.trim()}
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
                  data-testid="xrpl-trade-desk-nft-offer-form"
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
                    data-testid="xrpl-trade-desk-nft-offer-token-id"
                    value={nftOfferCreateForm.nftokenId}
                    onChange={(event) => setNftOfferCreateForm((prev) => ({ ...prev, nftokenId: event.target.value }))}
                    aria-label="NFT offer token ID"
                    placeholder="NFTokenID"
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      data-testid="xrpl-trade-desk-nft-offer-mode"
                      value={nftOfferCreateForm.mode}
                      onChange={(event) => setNftOfferCreateForm((prev) => ({ ...prev, mode: event.target.value as 'sell' | 'buy' }))}
                      aria-label="NFT offer mode"
                      className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory"
                    >
                      <option value="sell">Sell</option>
                      <option value="buy">Buy</option>
                    </select>
                    <input
                      data-testid="xrpl-trade-desk-nft-offer-amount"
                      value={nftOfferCreateForm.amountXrp}
                      onChange={(event) => setNftOfferCreateForm((prev) => ({ ...prev, amountXrp: event.target.value }))}
                      aria-label="NFT offer amount in XRP"
                      placeholder="Amount XRP"
                      className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory"
                    />
                    <input
                      data-testid="xrpl-trade-desk-nft-offer-destination"
                      value={nftOfferCreateForm.destination}
                      onChange={(event) => setNftOfferCreateForm((prev) => ({ ...prev, destination: event.target.value }))}
                      aria-label="NFT offer destination"
                      placeholder="Destination (optional)"
                      className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory"
                    />
                    <input
                      data-testid="xrpl-trade-desk-nft-offer-owner"
                      value={nftOfferCreateForm.owner}
                      onChange={(event) => setNftOfferCreateForm((prev) => ({ ...prev, owner: event.target.value }))}
                      aria-label="NFT offer owner"
                      placeholder="Owner (optional)"
                      className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory"
                    />
                  </div>
                  <button
                    data-testid="xrpl-trade-desk-nft-offer-submit"
                    type="submit"
                    disabled={deskLocked || regionBlocked || submitting}
                    className="rounded-xl bg-gradient-to-r from-[#90b889] via-[#5ea47e] to-[#3b7d66] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    Create NFT Offer
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      data-testid="xrpl-trade-desk-nft-sell-offer"
                      value={nftOfferAcceptForm.sellOffer}
                      onChange={(event) => setNftOfferAcceptForm((prev) => ({ ...prev, sellOffer: event.target.value }))}
                      aria-label="NFT sell offer ID"
                      placeholder="Sell offer ID"
                      className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory"
                    />
                    <input
                      data-testid="xrpl-trade-desk-nft-buy-offer"
                      value={nftOfferAcceptForm.buyOffer}
                      onChange={(event) => setNftOfferAcceptForm((prev) => ({ ...prev, buyOffer: event.target.value }))}
                      aria-label="NFT buy offer ID"
                      placeholder="Buy offer ID"
                      className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory"
                    />
                  </div>
                  <button
                    data-testid="xrpl-trade-desk-nft-accept"
                    type="button"
                    disabled={deskLocked || regionBlocked || submitting || (!nftOfferAcceptForm.sellOffer.trim() && !nftOfferAcceptForm.buyOffer.trim())}
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
                      data-testid="xrpl-trade-desk-nft-cancel-ids"
                      value={nftOfferCancelIds}
                      onChange={(event) => setNftOfferCancelIds(event.target.value)}
                      aria-label="NFT offer IDs to cancel"
                      placeholder="Offer IDs (comma-separated)"
                      className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory"
                    />
                    <button
                      data-testid="xrpl-trade-desk-nft-cancel"
                      type="button"
                      disabled={deskLocked || regionBlocked || submitting || !nftOfferCancelIds.trim()}
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
                      <datalist id="xrpl-issued-currency-options">
                        {ISSUED_CURRENCY_OPTIONS.map((option) => (
                          <option key={`issued-currency-option-${option.code}`} value={option.code}>
                            {option.label}
                          </option>
                        ))}
                      </datalist>
                      {renderDeskUtilities()}
                    </div>

                    {renderSubmissionRail('surface-inner h-fit space-y-3 p-4 xl:sticky xl:top-6')}
                  </div>
                </div>
              </div>
            ) : null}

            {!showExpertTools ? renderDeskUtilities() : null}
          </>
        </div>

        {!showExpertTools ? renderSubmissionRail() : null}
      </div>
    </section>
  )
}
