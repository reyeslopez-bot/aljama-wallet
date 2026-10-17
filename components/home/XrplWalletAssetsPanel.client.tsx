'use client'

import { shortHash } from '@/lib/xrpl-trade-helpers'

export type WalletAsset = {
  assetType: 'xrp' | 'issued'
  currency: string
  issuer: string | null
  value: string
  limit: string | null
}

type XrplWalletAssetsPanelProps = {
  assets: WalletAsset[]
  loading: boolean
  error: string | null
  disabled: boolean
  visibleLimit: number
  description?: string
  onRefresh: () => void
}

export default function XrplWalletAssetsPanel({
  assets,
  loading,
  error,
  disabled,
  visibleLimit,
  description,
  onRefresh,
}: XrplWalletAssetsPanelProps) {
  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-ivory/55">Wallet Balances</p>
          {description ? <p className="mt-1 text-xs text-ivory/55">{description}</p> : null}
        </div>
        <button
          data-testid="xrpl-trade-desk-assets-refresh"
          type="button"
          disabled={disabled}
          onClick={onRefresh}
          aria-label="Refresh wallet balances"
          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-ivory/70 disabled:opacity-60"
        >
          Refresh
        </button>
      </div>
      {loading ? <p className="text-sm text-ivory/60">Loading balances...</p> : null}
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {!loading && !error ? (
        <div className="space-y-2">
          {assets.slice(0, visibleLimit).map((asset) => (
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
    </>
  )
}
