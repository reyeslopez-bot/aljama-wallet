export const CHAIN_TRANSACTION_STATUSES = [
  'broadcasted',
  'pending',
  'confirmed',
  'failed',
  'replaced',
  'dropped',
] as const

export type ChainTransactionStatus = (typeof CHAIN_TRANSACTION_STATUSES)[number]

export const CHAIN_TRANSACTION_TYPES = [
  'transfer',
  'contract_call',
  'token_transfer',
  'approval',
  'trustline_set',
  'nft_mint',
  'offer_create',
  'offer_cancel',
  'nft_offer_create',
  'nft_offer_cancel',
  'nft_offer_accept',
] as const

export type ChainTransactionType = (typeof CHAIN_TRANSACTION_TYPES)[number]

export const ACTIVE_SPEND_CHAIN_TRANSACTION_STATUSES: readonly ChainTransactionStatus[] = [
  'broadcasted',
  'pending',
  'confirmed',
]

export const SYNCABLE_CHAIN_TRANSACTION_STATUSES: readonly ChainTransactionStatus[] = [
  'broadcasted',
  'pending',
  'confirmed',
]

export const TRANSFER_WORKFLOW_STATUSES = [
  'created',
  'pending_broadcast',
  'broadcasted',
  'pending',
  'confirmed',
  'failed',
  'replaced',
  'dropped',
  'denied',
  'review',
] as const

export type TransferWorkflowStatus = (typeof TRANSFER_WORKFLOW_STATUSES)[number]

export function normalizeChainTransactionStatus(status: string): ChainTransactionStatus {
  switch (status) {
    case 'broadcast':
      return 'broadcasted'
    case 'settled':
    case 'validated':
      return 'confirmed'
    case 'broadcasted':
    case 'pending':
    case 'confirmed':
    case 'failed':
    case 'replaced':
    case 'dropped':
      return status
    default:
      return 'pending'
  }
}

export function normalizeTransferWorkflowStatus(status: string): TransferWorkflowStatus {
  switch (status) {
    case 'initiated':
      return 'created'
    case 'approved':
      return 'pending_broadcast'
    case 'broadcast':
      return 'broadcasted'
    case 'settled':
    case 'validated':
      return 'confirmed'
    case 'submitted':
      return 'pending'
    case 'queued':
      return 'created'
    case 'created':
    case 'pending_broadcast':
    case 'broadcasted':
    case 'pending':
    case 'confirmed':
    case 'failed':
    case 'replaced':
    case 'dropped':
    case 'denied':
    case 'review':
      return status
    default:
      return 'failed'
  }
}

export function normalizeChainTransactionType(value?: string | null): ChainTransactionType {
  switch (value) {
    case 'transfer':
    case 'contract_call':
    case 'token_transfer':
    case 'approval':
    case 'trustline_set':
    case 'nft_mint':
    case 'offer_create':
    case 'offer_cancel':
    case 'nft_offer_create':
    case 'nft_offer_cancel':
    case 'nft_offer_accept':
      return value
    default:
      return 'contract_call'
  }
}
