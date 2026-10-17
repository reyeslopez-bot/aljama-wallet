'use client'

import type { FormEventHandler } from 'react'
import { TRADE_CURRENCY_OPTIONS } from '@/lib/xrpl-trade-constants'
import { formatPreviewAmount } from '@/lib/xrpl-trade-helpers'

export type SwapQuote = {
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

type XrplQuickSwapFormProps = {
  fromCurrency: string
  fromValue: string
  toCurrency: string
  fromIsXrp: boolean
  toIsXrp: boolean
  fromCode: string
  toCode: string
  estimatedReceive: number | null
  deliverMin: number | null
  statusHint: string
  routeSummary: string | null
  quote: SwapQuote | null
  validationIssues: string[]
  submitDisabled: boolean
  deskLocked: boolean
  regionBlocked: boolean
  networkName: string
  quoteLoading: boolean
  onFromCurrencyChange: (currency: string) => void
  onFromValueChange: (value: string) => void
  onToCurrencyChange: (currency: string) => void
  onRefreshQuote: () => void
  onSubmit: FormEventHandler<HTMLFormElement>
}

type CurrencySelectProps = {
  testId: string
  value: string
  label: string
  optionPrefix: string
  onChange: (currency: string) => void
}

function CurrencySelect({ testId, value, label, optionPrefix, onChange }: CurrencySelectProps) {
  return (
    <select
      data-testid={testId}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory"
      aria-label={label}
    >
      {TRADE_CURRENCY_OPTIONS.map((option) => (
        <option key={`${optionPrefix}-${option.code}`} value={option.code} className="bg-black text-ivory">
          {option.label}
        </option>
      ))}
    </select>
  )
}

function getQuoteDescription(quote: SwapQuote | null, networkName: string): string {
  if (!quote) {
    return `Quotes on ${networkName} search public XRPL liquidity first, then wallet-aware routing when available.`
  }

  const slippage = `${formatPreviewAmount(quote.slippageBps / 100)}%`
  if (quote.quoteMode !== 'public') {
    return `Using XRPL pathfinding with a ${slippage} minimum-receive guard.`
  }
  if (quote.routeKind === 'multi_hop') {
    return `Using public XRPL liquidity across ${quote.hops?.length ?? 0} legs with a ${slippage} minimum-receive estimate.`
  }
  return `Using public XRPL ${quote.liquiditySource ?? 'liquidity'} data with a ${slippage} minimum-receive estimate.`
}

export default function XrplQuickSwapForm({
  fromCurrency,
  fromValue,
  toCurrency,
  fromIsXrp,
  toIsXrp,
  fromCode,
  toCode,
  estimatedReceive,
  deliverMin,
  statusHint,
  routeSummary,
  quote,
  validationIssues,
  submitDisabled,
  deskLocked,
  regionBlocked,
  networkName,
  quoteLoading,
  onFromCurrencyChange,
  onFromValueChange,
  onToCurrencyChange,
  onRefreshQuote,
  onSubmit,
}: XrplQuickSwapFormProps) {
  return (
    <form
      data-testid="xrpl-trade-desk-quick-swap-form"
      className="surface-inner space-y-4 p-5"
      aria-labelledby="xrpl-trade-desk-quick-swap-title"
      aria-describedby={regionBlocked ? 'xrpl-trade-desk-region-policy' : undefined}
      onSubmit={onSubmit}
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
            onClick={onRefreshQuote}
            disabled={deskLocked || quoteLoading}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-ivory/70 disabled:opacity-60"
          >
            Refresh quote
          </button>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-ivory/50">You pay</p>
            <CurrencySelect
              testId="xrpl-trade-desk-quick-swap-from-currency"
              value={fromCurrency}
              label="Quick swap from currency"
              optionPrefix="quick-from"
              onChange={onFromCurrencyChange}
            />
            <p className="text-[11px] text-ivory/55">
              {fromIsXrp
                ? 'XRP is native, so there is no issuer on the spend side.'
                : `We will auto-pick a trusted ${fromCode} issuer from the wallet policy.`}
            </p>
            <input
              data-testid="xrpl-trade-desk-quick-swap-from-value"
              value={fromValue}
              onChange={(event) => onFromValueChange(event.target.value)}
              placeholder="Amount to spend"
              aria-label="Quick swap from amount"
              className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-ivory"
            />
          </div>

          <div className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-ivory/50">You receive</p>
            <CurrencySelect
              testId="xrpl-trade-desk-quick-swap-to-currency"
              value={toCurrency}
              label="Quick swap to currency"
              optionPrefix="quick-to"
              onChange={onToCurrencyChange}
            />
            <p className="text-[11px] text-ivory/55">
              {toIsXrp
                ? 'XRP is native, so there is no issuer on the receive side.'
                : `We will auto-pick the best trusted ${toCode} route that matches this wallet.`}
            </p>
            <div
              data-testid="xrpl-trade-desk-quick-swap-preview"
              className="rounded-2xl border border-white/10 bg-black/30 p-3 text-sm text-ivory/75"
            >
              <p className="text-xs uppercase tracking-[0.14em] text-ivory/50">Preview</p>
              <p className="mt-2">
                Estimated receive:{' '}
                <span className="font-semibold text-ivory">
                  {estimatedReceive ? `${formatPreviewAmount(estimatedReceive)} ${toCode}` : '--'}
                </span>
              </p>
              <p className="mt-1">
                Minimum receive:{' '}
                <span className="font-semibold text-ivory">
                  {deliverMin ? `${formatPreviewAmount(deliverMin)} ${toCode}` : '--'}
                </span>
              </p>
              <p className="mt-1 text-xs text-ivory/55">{statusHint}</p>
              {quote ? (
                <p className="mt-1 text-xs text-ivory/55">
                  {quote.quoteMode === 'public' ? 'Quote route' : 'Trusted route'}: {routeSummary}
                </p>
              ) : null}
              <p className="mt-1 text-xs text-ivory/55">{getQuoteDescription(quote, networkName)}</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/25 p-3 text-xs text-ivory/65">
          Simple swap uses trusted issuer policy behind the scenes. XRP stays native; issued assets such as EUR, USD,
          JPY, and XAU are resolved automatically from trusted issuers and live liquidity on {networkName}. Wallet-aware
          routing improves execution, but public quotes no longer depend on trustlines or funded account state.
        </div>

        {validationIssues.length > 0 ? (
          <div
            data-testid="xrpl-trade-desk-quick-swap-validation"
            className="rounded-xl border border-red-300/25 bg-red-300/10 p-3 text-xs text-red-200"
          >
            <ul className="space-y-1">
              {validationIssues.map((issue) => (
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
          disabled={submitDisabled}
          className="inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-[#7fb0d9] via-[#5c8db4] to-[#4b7c79] px-5 py-3 text-base font-semibold tracking-wide text-white shadow-lg shadow-[#4b7c79]/30 transition disabled:cursor-not-allowed disabled:opacity-60"
        >
          Submit simple swap
        </button>
      </fieldset>
    </form>
  )
}
