'use client'

import Link from 'next/link'
import { useEffect, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { formatUnits, isAddress, parseUnits } from 'ethers'
import { base, mainnet, polygon, sepolia } from 'viem/chains'
import { useLocale } from 'next-intl'
import { useManagedWalletSession } from '@/components/wallet/sync/ManagedWalletSessionContext.client'
import { useWalletSnapshotQuery, useWalletTransactionsQuery } from '@/components/wallet/sync/useWalletQueries'
import { walletQueryKeys } from '@/components/wallet/sync/wallet-query-keys'
import { parseClientApiError } from '@/lib/security/client-api-error'
import type { WalletSendResponse, WalletTransactionItem } from '@/types/wallet-api'

const KNOWN_EVM_CHAINS = [mainnet, sepolia, polygon, base].map((chain) => ({
  id: chain.id,
  label: chain.name,
  symbol: chain.nativeCurrency.symbol,
}))

function shortValue(value: string | null | undefined, edge = 6): string {
  if (!value) return '—'
  if (value.length <= edge * 2) return value
  return `${value.slice(0, edge)}...${value.slice(-edge)}`
}

function formatNativeAmount(value: string): string {
  try {
    const formatted = formatUnits(BigInt(value), 18)
    const [whole, fraction = ''] = formatted.split('.')
    if (!fraction) return whole
    return `${whole}.${fraction.slice(0, 6)}`.replace(/\.$/, '')
  } catch {
    return value
  }
}

function formatTimestamp(value: string | null): string {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed)
}

function humanizeStatus(value: string): string {
  return value.replaceAll('_', ' ')
}

function resolveChainOption(chainId: number) {
  return KNOWN_EVM_CHAINS.find((item) => item.id === chainId) ?? {
    id: chainId,
    label: `Chain ${chainId}`,
    symbol: 'ETH',
  }
}

function parseAmountToWei(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  try {
    return parseUnits(trimmed, 18).toString()
  } catch {
    return null
  }
}

function makeIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `00000000-0000-4000-8000-${Date.now().toString().padStart(12, '0').slice(-12)}`
}

type WalletWorkspaceProps = {
  allowedChainIds: number[]
}

type SubmissionState =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'success'; response: WalletSendResponse }
  | { kind: 'error'; message: string }

export default function WalletWorkspace({ allowedChainIds }: WalletWorkspaceProps) {
  const locale = useLocale()
  const { walletId } = useManagedWalletSession()
  const queryClient = useQueryClient()
  const snapshotQuery = useWalletSnapshotQuery(walletId, { enabled: Boolean(walletId) })
  const transactionsQuery = useWalletTransactionsQuery(walletId, {
    enabled: Boolean(walletId),
    limit: 10,
  })

  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle')
  const [destination, setDestination] = useState('')
  const [amount, setAmount] = useState('')
  const [chainInput, setChainInput] = useState(allowedChainIds[0] ? String(allowedChainIds[0]) : '')
  const [gasLimit, setGasLimit] = useState('')
  const [maxFeePerGasWei, setMaxFeePerGasWei] = useState('')
  const [maxPriorityFeePerGasWei, setMaxPriorityFeePerGasWei] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [submission, setSubmission] = useState<SubmissionState>({ kind: 'idle' })

  useEffect(() => {
    if (copyState !== 'copied') return
    const timeout = window.setTimeout(() => setCopyState('idle'), 1500)
    return () => window.clearTimeout(timeout)
  }, [copyState])

  useEffect(() => {
    if (chainInput || allowedChainIds.length === 0) return
    setChainInput(String(allowedChainIds[0]))
  }, [allowedChainIds, chainInput])

  const allowedOptions = Array.from(new Set(allowedChainIds))
    .filter((value) => Number.isInteger(value) && value > 0)
    .map((value) => resolveChainOption(value))
  const selectedChainId = Number(chainInput)
  const selectedChain = Number.isInteger(selectedChainId) && selectedChainId > 0
    ? resolveChainOption(selectedChainId)
    : null
  const amountWei = parseAmountToWei(amount)
  const address = snapshotQuery.data?.address ?? null
  const submitDisabled =
    !walletId ||
    submission.kind === 'pending' ||
    !destination.trim() ||
    !isAddress(destination.trim()) ||
    !amountWei ||
    !selectedChain

  async function copyAddress() {
    if (!address || typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return
    try {
      await navigator.clipboard.writeText(address)
      setCopyState('copied')
    } catch {
      // Ignore clipboard failures.
    }
  }

  async function refreshWalletData() {
    if (!walletId) return
    await queryClient.invalidateQueries({ queryKey: walletQueryKeys.wallet(walletId) })
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!walletId) {
      setSubmission({ kind: 'error', message: 'No managed wallet is linked to this session.' })
      return
    }
    if (!isAddress(destination.trim())) {
      setSubmission({ kind: 'error', message: 'Enter a valid destination address.' })
      return
    }
    if (!amountWei) {
      setSubmission({ kind: 'error', message: 'Enter a valid amount in native units.' })
      return
    }
    if (!selectedChain) {
      setSubmission({ kind: 'error', message: 'Enter a valid EVM chain ID.' })
      return
    }

    setSubmission({ kind: 'pending' })

    try {
      const response = await fetch(`/api/wallet/${walletId}/send`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          to: destination.trim(),
          amountWei,
          chainId: selectedChain.id,
          idempotencyKey: makeIdempotencyKey(),
          ...(gasLimit.trim() ? { gasLimit: gasLimit.trim() } : {}),
          ...(maxFeePerGasWei.trim() ? { maxFeePerGasWei: maxFeePerGasWei.trim() } : {}),
          ...(maxPriorityFeePerGasWei.trim()
            ? { maxPriorityFeePerGasWei: maxPriorityFeePerGasWei.trim() }
            : {}),
        }),
      })
      const body = (await response.json().catch(() => null)) as WalletSendResponse | Record<string, unknown> | null
      if (!response.ok || !body || !(body as { ok?: boolean }).ok) {
        throw new Error(parseClientApiError(response, body).message)
      }

      setSubmission({ kind: 'success', response: body as WalletSendResponse })
      setDestination('')
      setAmount('')
      setGasLimit('')
      setMaxFeePerGasWei('')
      setMaxPriorityFeePerGasWei('')
      setShowAdvanced(false)
      await refreshWalletData()
    } catch (error) {
      setSubmission({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Send failed.',
      })
    }
  }

  return (
    <section data-testid="wallet-workspace" className="space-y-5">
      <header className="surface-panel panel-glow-saffron relative p-6">
        <div className="absolute inset-x-8 top-5 ornament-line" />
        <div className="relative space-y-3">
          <p className="text-xs uppercase tracking-[0.18em] text-saffron/75">Wallet Workspace</p>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="font-display text-2xl font-semibold text-ivory">Send and receive for managed custody</h1>
              <p className="mt-2 text-sm text-ivory/70">
                This route uses the managed wallet snapshot and transfer APIs. It is separate from the local
                session-only vault created on the landing page.
              </p>
            </div>
            <Link
              href={`/${locale}`}
              className="rounded-full border border-white/12 bg-white/5 px-4 py-2 text-sm font-semibold text-ivory/80 transition hover:bg-white/10"
            >
              Back home
            </Link>
          </div>
        </div>
      </header>

      {!walletId ? (
        <div data-testid="wallet-workspace-empty" className="surface-panel panel-glow-jade p-6 text-sm text-ivory/72">
          <p className="text-lg font-semibold text-ivory">No managed wallet available</p>
          <p className="mt-2">
            This account does not currently have a managed custody wallet record. The landing-page local vault and the
            external wallet connection do not populate this workspace.
          </p>
        </div>
      ) : (
        <>
          <div className="surface-panel panel-glow-lapis p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-ivory/55">Wallet ID</p>
                <p className="mt-2 break-all font-mono text-sm text-ivory">{walletId}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-ivory/55">Last updated</p>
                <p className="mt-2 text-sm text-ivory">
                  {snapshotQuery.data ? formatTimestamp(snapshotQuery.data.updatedAt) : 'Loading wallet snapshot...'}
                </p>
              </div>
            </div>

            {snapshotQuery.error ? (
              <p className="mt-4 text-sm text-red-300">
                {snapshotQuery.error instanceof Error ? snapshotQuery.error.message : 'Failed to load wallet snapshot.'}
              </p>
            ) : null}

            {snapshotQuery.data ? (
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-xs uppercase tracking-[0.14em] text-ivory/55">Address</p>
                  <p className="mt-2 break-all font-mono text-sm text-jade">{snapshotQuery.data.address}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-xs uppercase tracking-[0.14em] text-ivory/55">Transfer attempts (24h)</p>
                  <p className="mt-2 text-xl font-semibold text-ivory">
                    {snapshotQuery.data.summary.transferAttemptCount24h}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-xs uppercase tracking-[0.14em] text-ivory/55">Last transfer status</p>
                  <p className="mt-2 text-sm font-semibold capitalize text-ivory">
                    {snapshotQuery.data.summary.lastTransferStatus
                      ? humanizeStatus(snapshotQuery.data.summary.lastTransferStatus)
                      : 'No transfers yet'}
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="surface-panel panel-glow-jade p-6">
              <p className="text-xs uppercase tracking-[0.16em] text-jade/80">Receive</p>
              <h2 className="mt-2 text-xl font-semibold text-ivory">Deposit to the managed wallet</h2>
              <p className="mt-2 text-sm text-ivory/70">
                Copy the custody address below and send supported EVM assets to it. Incoming transfers will appear here
                after sync.
              </p>
              <div className="mt-4 rounded-2xl border border-jade/20 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-jade/80">Address</p>
                <p
                  data-testid="wallet-workspace-receive-address"
                  className="mt-2 break-all font-mono text-sm text-jade"
                >
                  {address ?? 'Loading address...'}
                </p>
                <button
                  data-testid="wallet-workspace-copy-address"
                  type="button"
                  onClick={() => void copyAddress()}
                  disabled={!address}
                  className="mt-4 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold text-ivory transition hover:bg-white/15 disabled:opacity-60"
                >
                  {copyState === 'copied' ? 'Copied' : 'Copy address'}
                </button>
              </div>
            </div>

            <form
              data-testid="wallet-workspace-send-form"
              className="surface-panel panel-glow-saffron space-y-4 p-6"
              onSubmit={handleSubmit}
            >
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-saffron/75">Send</p>
                <h2 className="mt-2 text-xl font-semibold text-ivory">Queue a native EVM transfer</h2>
                <p className="mt-2 text-sm text-ivory/70">
                  This submits a managed-wallet signing intent through the backend. Amounts are entered in native units,
                  not wei.
                </p>
              </div>

              <label className="block space-y-2">
                <span className="text-xs uppercase tracking-[0.14em] text-ivory/55">Destination</span>
                <input
                  data-testid="wallet-workspace-send-destination"
                  value={destination}
                  onChange={(event) => setDestination(event.target.value)}
                  placeholder="0x..."
                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-ivory placeholder:text-ivory/35"
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-2">
                  <span className="text-xs uppercase tracking-[0.14em] text-ivory/55">Amount</span>
                  <input
                    data-testid="wallet-workspace-send-amount"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder={selectedChain ? `0.1 ${selectedChain.symbol}` : '0.1'}
                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-ivory placeholder:text-ivory/35"
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-xs uppercase tracking-[0.14em] text-ivory/55">Chain</span>
                  {allowedOptions.length > 0 ? (
                    <select
                      data-testid="wallet-workspace-send-chain-select"
                      value={chainInput}
                      onChange={(event) => setChainInput(event.target.value)}
                      className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-ivory"
                    >
                      {allowedOptions.map((option) => (
                        <option key={option.id} value={option.id} className="bg-black text-ivory">
                          {option.label} ({option.id})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div
                      data-testid="wallet-workspace-send-chain-unavailable"
                      className="rounded-2xl border border-dashed border-white/10 bg-black/20 px-4 py-3 text-sm text-ivory/55"
                    >
                      Wallet sending is unavailable until the backend resolves its active EVM chain.
                    </div>
                  )}
                </label>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-xs text-ivory/60">
                {selectedChain
                  ? `Submitting on ${selectedChain.label} (${selectedChain.id}) in ${selectedChain.symbol}.`
                  : 'The backend has not exposed an active EVM send chain to this session yet.'}
                {amountWei ? ` Parsed amount: ${amountWei} wei.` : ''}
              </div>

              <button
                data-testid="wallet-workspace-advanced-toggle"
                type="button"
                onClick={() => setShowAdvanced((open) => !open)}
                className="rounded-full border border-white/12 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-ivory/75 transition hover:bg-white/10"
              >
                {showAdvanced ? 'Hide gas overrides' : 'Show gas overrides'}
              </button>

              {showAdvanced ? (
                <div className="grid gap-4 sm:grid-cols-3">
                  <label className="block space-y-2">
                    <span className="text-xs uppercase tracking-[0.14em] text-ivory/55">Gas limit</span>
                    <input
                      data-testid="wallet-workspace-send-gas-limit"
                      value={gasLimit}
                      onChange={(event) => setGasLimit(event.target.value)}
                      inputMode="numeric"
                      placeholder="21000"
                      className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-ivory placeholder:text-ivory/35"
                    />
                  </label>
                  <label className="block space-y-2">
                    <span className="text-xs uppercase tracking-[0.14em] text-ivory/55">Max fee (wei)</span>
                    <input
                      data-testid="wallet-workspace-send-max-fee"
                      value={maxFeePerGasWei}
                      onChange={(event) => setMaxFeePerGasWei(event.target.value)}
                      inputMode="numeric"
                      placeholder="20000000000"
                      className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-ivory placeholder:text-ivory/35"
                    />
                  </label>
                  <label className="block space-y-2">
                    <span className="text-xs uppercase tracking-[0.14em] text-ivory/55">Priority fee (wei)</span>
                    <input
                      data-testid="wallet-workspace-send-priority-fee"
                      value={maxPriorityFeePerGasWei}
                      onChange={(event) => setMaxPriorityFeePerGasWei(event.target.value)}
                      inputMode="numeric"
                      placeholder="1000000000"
                      className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-ivory placeholder:text-ivory/35"
                    />
                  </label>
                </div>
              ) : null}

              <button
                data-testid="wallet-workspace-send-submit"
                type="submit"
                disabled={submitDisabled}
                className="inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-[#7fb0d9] via-[#5c8db4] to-[#4b7c79] px-5 py-3 text-base font-semibold tracking-wide text-white shadow-lg shadow-[#4b7c79]/30 transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submission.kind === 'pending' ? 'Queueing transfer...' : 'Queue send'}
              </button>

              {submission.kind === 'error' ? (
                <p data-testid="wallet-workspace-send-error" className="text-sm text-red-300">
                  {submission.message}
                </p>
              ) : null}

              {submission.kind === 'success' ? (
                <div
                  data-testid="wallet-workspace-send-success"
                  className="rounded-2xl border border-jade/20 bg-jade/10 p-4 text-sm text-jade"
                >
                  <p className="font-semibold">Transfer queued</p>
                  <p className="mt-2">Intent: {submission.response.intentId}</p>
                  <p>Status: {submission.response.status}</p>
                  <p>Chain: {submission.response.chainId}</p>
                  <p>Amount: {formatNativeAmount(submission.response.amountWei)} {selectedChain?.symbol ?? 'ETH'}</p>
                </div>
              ) : null}
            </form>
          </div>

          <div className="surface-panel panel-glow-jade p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-jade/80">Recent activity</p>
                <h2 className="mt-2 text-xl font-semibold text-ivory">Latest wallet transactions</h2>
                <p className="mt-2 text-sm text-ivory/70">
                  Recent transactional history for this managed wallet, including queued and confirmed transfers.
                </p>
              </div>
              <button
                data-testid="wallet-workspace-refresh"
                type="button"
                onClick={() => void refreshWalletData()}
                className="rounded-full border border-white/12 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-ivory/75 transition hover:bg-white/10"
              >
                Refresh
              </button>
            </div>

            {transactionsQuery.isLoading ? (
              <p className="mt-4 text-sm text-ivory/60">Loading recent transactions...</p>
            ) : null}

            {transactionsQuery.error ? (
              <p className="mt-4 text-sm text-red-300">
                {transactionsQuery.error instanceof Error
                  ? transactionsQuery.error.message
                  : 'Failed to load wallet transactions.'}
              </p>
            ) : null}

            {!transactionsQuery.isLoading && !transactionsQuery.error ? (
              <div className="mt-4 space-y-3">
                {transactionsQuery.data?.items.length ? (
                  transactionsQuery.data.items.map((item) => (
                    <TransactionRow key={item.id} item={item} />
                  ))
                ) : (
                  <p className="text-sm text-ivory/60">No wallet transactions recorded yet.</p>
                )}
              </div>
            ) : null}
          </div>
        </>
      )}
    </section>
  )
}

function TransactionRow({ item }: { item: WalletTransactionItem }) {
  const chainId = item.chainId ?? (item.networkId ? Number(item.networkId) : null)
  const chain = chainId && Number.isInteger(chainId) ? resolveChainOption(chainId) : null
  const directionTone =
    item.direction === 'incoming'
      ? 'border-jade/25 bg-jade/10 text-jade'
      : 'border-saffron/25 bg-saffron/10 text-saffron'

  return (
    <div
      data-testid="wallet-workspace-transaction-row"
      className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-ivory/78"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${directionTone}`}>
            {item.direction}
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] uppercase tracking-[0.12em] text-ivory/70">
            {humanizeStatus(item.status)}
          </span>
        </div>
        <span className="text-xs text-ivory/55">{formatTimestamp(item.createdAt)}</span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-ivory/55">Amount</p>
          <p className="mt-1 font-mono text-sm text-ivory">
            {formatNativeAmount(item.amountWei)} {chain?.symbol ?? 'ETH'}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-ivory/55">Counterparty</p>
          <p className="mt-1 font-mono text-sm text-ivory">{shortValue(item.counterparty)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-ivory/55">Hash</p>
          <p className="mt-1 font-mono text-sm text-ivory">{shortValue(item.txHash)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-ivory/55">Network</p>
          <p className="mt-1 text-sm text-ivory">{chain ? `${chain.label} (${chain.id})` : item.networkId ?? '—'}</p>
        </div>
      </div>
    </div>
  )
}
