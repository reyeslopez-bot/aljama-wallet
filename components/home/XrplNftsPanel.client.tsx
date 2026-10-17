'use client'

import { useMemo } from 'react'
import { shortHash } from '@/lib/xrpl-trade-helpers'

export type WalletNft = {
  nftokenId: string | null
  uri: string | null
  issuer: string | null
  metadata: {
    name: string | null
    image: string | null
    description: string | null
  } | null
}

type XrplNftsPanelProps = {
  nfts: WalletNft[]
  loading: boolean
  error: string | null
  disabled: boolean
  page: number
  onPageChange: (page: number) => void
  onRefresh: () => void
}

const PAGE_SIZE = 6

export default function XrplNftsPanel({
  nfts,
  loading,
  error,
  disabled,
  page,
  onPageChange,
  onRefresh,
}: XrplNftsPanelProps) {
  const pageCount = Math.max(1, Math.ceil(nfts.length / PAGE_SIZE))
  const pagedNfts = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return nfts.slice(start, start + PAGE_SIZE)
  }, [nfts, page])

  return (
    <div data-testid="xrpl-trade-desk-nfts" className="surface-inner space-y-3 p-4 lg:col-span-2">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.16em] text-ivory/55">Wallet NFTs</p>
        <button
          data-testid="xrpl-trade-desk-nfts-refresh"
          type="button"
          disabled={disabled}
          onClick={onRefresh}
          aria-label="Refresh wallet NFTs"
          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-ivory/70 disabled:opacity-60"
        >
          Refresh
        </button>
      </div>
      {loading ? <p className="text-sm text-ivory/60">Loading NFTs...</p> : null}
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {!loading && !error ? (
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
                <p className="mt-1 line-clamp-2 text-xs text-ivory/60">
                  {nft.metadata?.description ?? nft.uri ?? 'No metadata'}
                </p>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between text-xs text-ivory/70">
            <button
              type="button"
              onClick={() => onPageChange(Math.max(1, page - 1))}
              disabled={page <= 1}
              aria-label="Previous NFT page"
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 disabled:opacity-50"
            >
              Prev
            </button>
            <span>Page {page} / {pageCount}</span>
            <button
              type="button"
              onClick={() => onPageChange(Math.min(pageCount, page + 1))}
              disabled={page >= pageCount}
              aria-label="Next NFT page"
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </>
      ) : null}
    </div>
  )
}
