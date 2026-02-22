export type WalletAuthority = {
  transactional: 'cockroachdb'
  analytics: 'postgres' | 'memory'
  chain: 'xrpl'
}

export type WalletReconciliation = {
  source: 'xrpl'
  status: 'synced' | 'unknown' | 'not_applicable'
  checkedAt: string
  ledgerIndex: number | null
  ledgerHash: string | null
}

export type WalletSnapshot = {
  walletId: string
  address: string
  createdAt: string
  authorities: WalletAuthority
  summary: {
    transactionalTxCount: number
    transferAttemptCount24h: number
    lastTransactionalAt: string | null
    lastTransferStatus: WalletTransactionStatus | null
  }
  reconciliation: WalletReconciliation
  updatedAt: string
}

export type WalletTransactionStatus =
  | 'initiated'
  | 'approved'
  | 'broadcast'
  | 'failed'
  | 'denied'
  | 'review'
  | 'settled'

export type WalletTransactionSource = 'transactional' | 'analytics' | 'optimistic'

export type WalletTransactionItem = {
  id: string
  source: WalletTransactionSource
  direction: 'incoming' | 'outgoing'
  amountWei: string
  asset: string | null
  chainId: number | null
  status: WalletTransactionStatus
  counterparty: string | null
  idempotencyKey: string | null
  txHash: string | null
  createdAt: string
}

export type WalletTransactionsPage = {
  walletId: string
  items: WalletTransactionItem[]
  nextCursor: string | null
}

export type WalletSendInput = {
  to: string
  amountWei: string
  chainId: number
  idempotencyKey: string
  nonce?: number
  gasLimit?: string
  maxFeePerGasWei?: string
  maxPriorityFeePerGasWei?: string
}

export type WalletSendResponse = {
  ok: true
  walletId: string
  to: string
  amountWei: string
  chainId: number
  correlationId: string
  idempotencyKey: string
  signedTx: string
  txHash: string
  derivedHash?: string
  recorded: boolean
}
