export const CHAIN_TRANSACTION_STATUSES = [
  'submitted',
  'included',
  'confirmed_soft',
  'confirmed_final',
  'reorged',
  'failed',
  'replaced',
  'dropped',
] as const

export type ChainTransactionStatus = (typeof CHAIN_TRANSACTION_STATUSES)[number]
export type EvmFinalityStatus = Extract<
  ChainTransactionStatus,
  'included' | 'confirmed_soft' | 'confirmed_final'
>

export const CHAIN_TRANSACTION_TYPES = [
  'transfer',
  'contract_call',
  'token_transfer',
  'approval',
  'account_set',
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
  'submitted',
  'included',
  'confirmed_soft',
  'confirmed_final',
]

export const SYNCABLE_CHAIN_TRANSACTION_STATUSES: readonly ChainTransactionStatus[] = [
  'submitted',
  'included',
  'confirmed_soft',
  'confirmed_final',
  'reorged',
]

export const TRANSFER_WORKFLOW_STATUSES = [
  'created',
  'pending_broadcast',
  'submitted',
  'included',
  'confirmed_soft',
  'confirmed_final',
  'reorged',
  'failed',
  'replaced',
  'dropped',
  'denied',
  'review',
] as const

export type TransferWorkflowStatus = (typeof TRANSFER_WORKFLOW_STATUSES)[number]

export const EVM_FINALITY_FINAL_CONFIRMATIONS = 12

export function getEvmTransactionFinality(input: {
  currentBlockNumber: number
  includedBlockNumber: number | null | undefined
}): {
  status: EvmFinalityStatus
  confirmationCount: number
} {
  const includedBlockNumber = input.includedBlockNumber
  if (
    typeof includedBlockNumber !== 'number' ||
    !Number.isInteger(includedBlockNumber) ||
    includedBlockNumber < 0
  ) {
    return {
      status: 'included',
      confirmationCount: 1,
    }
  }

  const rawConfirmations = input.currentBlockNumber - includedBlockNumber + 1
  const confirmationCount = Math.max(1, rawConfirmations)

  if (confirmationCount >= EVM_FINALITY_FINAL_CONFIRMATIONS) {
    return {
      status: 'confirmed_final',
      confirmationCount,
    }
  }

  if (confirmationCount >= 2) {
    return {
      status: 'confirmed_soft',
      confirmationCount,
    }
  }

  return {
    status: 'included',
    confirmationCount,
  }
}

export function normalizeChainTransactionStatus(status: string): ChainTransactionStatus {
  switch (status) {
    case 'broadcast':
    case 'broadcasted':
    case 'submitted':
    case 'pending':
      return 'submitted'
    case 'included':
      return 'included'
    case 'confirmed':
      return 'confirmed_soft'
    case 'settled':
    case 'validated':
      return 'confirmed_final'
    case 'confirmed_soft':
    case 'confirmed_final':
    case 'reorged':
    case 'failed':
    case 'replaced':
    case 'dropped':
      return status
    default:
      return 'submitted'
  }
}

export function normalizeTransferWorkflowStatus(status: string): TransferWorkflowStatus {
  switch (status) {
    case 'initiated':
      return 'created'
    case 'approved':
      return 'pending_broadcast'
    case 'broadcast':
    case 'broadcasted':
    case 'submitted':
    case 'pending':
      return 'submitted'
    case 'included':
      return 'included'
    case 'confirmed':
      return 'confirmed_soft'
    case 'settled':
    case 'validated':
      return 'confirmed_final'
    case 'queued':
      return 'created'
    case 'created':
    case 'pending_broadcast':
    case 'confirmed_soft':
    case 'confirmed_final':
    case 'reorged':
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
    case 'account_set':
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
