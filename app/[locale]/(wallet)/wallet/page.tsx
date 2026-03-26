import WalletWorkspace from '@/components/wallet/ui/WalletWorkspace.client'
import { resolveWalletSendSupportedChainIds } from '@/lib/wallet-send-config'

export default async function WalletPage() {
  return <WalletWorkspace allowedChainIds={await resolveWalletSendSupportedChainIds()} />
}
