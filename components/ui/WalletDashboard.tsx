// components/wallet/ui/WalletDashboard.tsx
'use client'

import { XrplDevAccountCard } from '@/components/wallet/ui/XrplDevAccountCard'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createPublicClient, formatEther, http } from 'viem'
import { mainnet } from 'viem/chains'
import { useWalletStore } from '@/infra/state/walletStore'
import Button from '@/components/ui/Button'
import { clearEncryptedSession } from '@/lib/storage/walletSession'

// Simple viem public client for now (you can later swap to your wagmi config)
const publicClient = createPublicClient({
  chain: mainnet,
  transport: http(),
})

function truncateAddress(address: string, chars = 4) {
  if (!address.startsWith('0x') || address.length <= 2 * chars + 2) return address
  return `${address.slice(0, 2 + chars)}…${address.slice(-chars)}`
}

export function WalletDashboard() {
  const router = useRouter()
  const wallet = useWalletStore((s) => s.wallet)
  const clearWallet = useWalletStore((s) => s.clearWallet)

  const [balance, setBalance] = useState<string | null>(null)
  const [isLoadingBalance, setIsLoadingBalance] = useState(false)
  const [balanceError, setBalanceError] = useState<string | null>(null)

  // If no wallet is loaded, send user to unlock screen
  useEffect(() => {
    if (!wallet) {
      router.replace('/unlock')
    }
  }, [wallet, router])

  // Load ETH balance on mainnet when wallet is present
  useEffect(() => {
    if (!wallet) return

    const loadBalance = async () => {
      setIsLoadingBalance(true)
      setBalanceError(null)

      try {
        const raw = await publicClient.getBalance({
          address: wallet.address as `0x${string}`,
        })
        setBalance(formatEther(raw))
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to load balance'
        setBalanceError(msg)
      } finally {
        setIsLoadingBalance(false)
      }
    }

    void loadBalance()
  }, [wallet])

  const handleCopyAddress = async () => {
    if (!wallet) return
    try {
      await navigator.clipboard.writeText(wallet.address)
    } catch {
      // ignore
    }
  }

  const handleLock = () => {
    clearWallet()
    clearEncryptedSession()
    router.push('/unlock')
  }

  // While redirecting / no wallet
  if (!wallet) {
    return (
      <div className="max-w-md mx-auto p-4">
        <h2 className="text-xl font-bold mb-2">No Wallet Loaded</h2>
        <p className="text-sm text-gray-600 mb-4">
          You don&apos;t have an active wallet session.
        </p>
        <div className="flex gap-2">
          <Button
            label="Unlock Existing"
            variant="primary"
            size="md"
            onClick={() => router.push('/unlock')}
          />
          <Button
            label="Create New"
            variant="secondary"
            size="md"
            onClick={() => router.push('/')}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto p-4 border rounded-lg space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Your Wallet</h2>
        <Button
          label="Lock"
          size="sm"
          variant="secondary"
          onClick={handleLock}
        />
      </div>

      <div className="space-y-2">
        <div className="text-sm font-medium text-gray-700">Address</div>
        <div className="flex items-center justify-between gap-2">
          <code className="text-xs bg-gray-100 px-2 py-1 rounded break-all">
            {truncateAddress(wallet.address, 6)}
          </code>
          <Button
            label="Copy"
            size="sm"
            variant="secondary"
            onClick={handleCopyAddress}
          />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {/* existing ETH / local wallet tiles */}
        {/* ... */}
        <XrplDevAccountCard />
      </div>

      <div className="space-y-2">
        <div className="text-sm font-medium text-gray-700">
          Balance (ETH, mainnet)
        </div>
        {isLoadingBalance ? (
          <div className="text-sm text-gray-500">Loading balance…</div>
        ) : balanceError ? (
          <div className="text-sm text-red-600">{balanceError}</div>
        ) : (
          <div className="text-2xl font-semibold">
            {balance ?? '0.00'}
          </div>
        )}
      </div>

      <div className="pt-2 border-t border-gray-200 space-y-2">
        <div className="text-sm font-medium text-gray-700">
          Coming next
        </div>
        <ul className="text-sm text-gray-600 list-disc list-inside space-y-1">
          <li>Send / receive transactions</li>
          <li>Network switching (Sepolia, custom RPCs)</li>
          <li>Transaction history</li>
          <li>XRPL account tile</li>
        </ul>
      </div>
    </div>
  )
}
