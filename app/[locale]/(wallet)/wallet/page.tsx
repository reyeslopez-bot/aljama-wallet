import WalletWorkspace from '@/components/wallet/ui/WalletWorkspace.client'

function parseAllowedChainIds(): number[] {
  const raw = process.env.WALLET_ALLOWED_CHAIN_IDS
  if (!raw) return []

  return Array.from(
    new Set(
      raw
        .split(',')
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isInteger(value) && value > 0),
    ),
  )
}

export default function WalletPage() {
  return <WalletWorkspace allowedChainIds={parseAllowedChainIds()} />
}
