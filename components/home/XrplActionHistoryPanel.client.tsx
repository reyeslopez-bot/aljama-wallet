'use client'

import { shortHash } from '@/lib/xrpl-trade-helpers'

export type XrplAction = {
  id: string
  action: string
  status: string
  txHash: string | null
  engineResult: string | null
  updatedAt: string
}

type XrplActionHistoryPanelProps = {
  actions: XrplAction[]
  loading: boolean
  error: string | null
  disabled: boolean
  onRefresh: () => void
}

export default function XrplActionHistoryPanel({
  actions,
  loading,
  error,
  disabled,
  onRefresh,
}: XrplActionHistoryPanelProps) {
  return (
    <div data-testid="xrpl-trade-desk-history" className="surface-inner space-y-3 p-4 lg:col-span-2">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.16em] text-ivory/55">Recent Ledger Actions</p>
        <button
          data-testid="xrpl-trade-desk-history-refresh"
          type="button"
          disabled={disabled}
          onClick={onRefresh}
          aria-label="Refresh recent ledger actions"
          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-ivory/70 disabled:opacity-60"
        >
          Refresh
        </button>
      </div>
      {loading ? <p className="text-sm text-ivory/60">Loading recent actions...</p> : null}
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {!loading && !error ? (
        <div className="space-y-2">
          {actions.slice(0, 10).map((item) => (
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
          {actions.length === 0 ? <p className="text-sm text-ivory/55">No actions yet.</p> : null}
        </div>
      ) : null}
    </div>
  )
}
