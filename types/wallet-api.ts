import type {
  ChainTransactionType,
  TransferWorkflowStatus,
} from '@/lib/chain-transactions'

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

export type WalletTransactionStatus = TransferWorkflowStatus

export type WalletTransactionSource = 'transactional' | 'analytics' | 'indexed' | 'optimistic'

export type WalletTransactionItem = {
  id: string
  source: WalletTransactionSource
  direction: 'incoming' | 'outgoing'
  amountWei: string
  asset: string | null
  chainType: string | null
  networkId: string | null
  chainId: number | null
  txType: ChainTransactionType | null
  status: WalletTransactionStatus
  counterparty: string | null
  idempotencyKey: string | null
  txHash: string | null
  nonce: string | null
  replacesTxHash: string | null
  replacedByTxHash: string | null
  gasLimit: string | null
  gasPrice: string | null
  maxFeePerGas: string | null
  maxPriorityFeePerGas: string | null
  gasUsed: string | null
  blockHeight: string | null
  blockHash: string | null
  contractAddress: string | null
  tokenId: string | null
  data: string | null
  confirmedAt: string | null
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
  intentId: string
  status: 'queued' | 'signing' | 'signed' | 'broadcasted' | 'failed'
  walletId: string
  to: string
  amountWei: string
  chainId: number
  correlationId: string
  idempotencyKey: string
  transferLogId: string | null
}

export type WalletSigningIntentResponse = {
  ok: true
  intentId: string
  status: 'queued' | 'signing' | 'signed' | 'broadcasted' | 'failed'
  walletId: string
  chainId: number
  correlationId: string
  idempotencyKey: string
  transferLogId: string | null
  txHash: string | null
  errorCode: string | null
  createdAt: string
  updatedAt: string
}
