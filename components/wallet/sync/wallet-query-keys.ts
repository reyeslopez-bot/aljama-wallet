export const walletQueryKeys = {
  all: ['wallet'] as const,
  wallet: (walletId: string) => ['wallet', walletId] as const,
  snapshot: (walletId: string) => ['wallet', walletId, 'snapshot'] as const,
  transactionsRoot: (walletId: string) => ['wallet', walletId, 'transactions'] as const,
  transactions: (walletId: string, cursor: string | null = null, limit = 25) =>
    ['wallet', walletId, 'transactions', { cursor, limit }] as const,
}
