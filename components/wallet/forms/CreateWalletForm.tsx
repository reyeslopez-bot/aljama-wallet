'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createEncryptedWallet } from '@/lib/wallet'
import { useWalletStore } from '@/infra/state/walletStore'
import Button from '@/components/ui/Button'

export default function CreateWalletForm() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const setWallet = useWalletStore((s) => s.setWallet)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!password.trim() || !confirmPassword.trim()) {
      setError('Password and confirmation are required')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    try {
      setIsLoading(true)

      // 🔐 REAL WALLET CREATION LOGIC
      const { encrypted, wallet } = createEncryptedWallet(password)

      // store encrypted blob for unlock flow
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('aljama.encryptedWallet', encrypted)
      }

      // store unlocked wallet globally
      setWallet(wallet)

      router.push('/wallet')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong'
      setError(msg)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md mx-auto p-4 border rounded-lg">
      <h2 className="text-xl font-bold mb-4">Create Wallet</h2>

      <label className="block mb-4">
        <span className="text-sm font-medium">New Password</span>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          className="mt-1 block w-full border p-2 rounded"
          placeholder="••••••"
          required
        />
      </label>

      <label className="block mb-4">
        <span className="text-sm font-medium">Confirm Password</span>
        <input
          type="password"
          value={confirmPassword}
          onChange={e => setConfirmPassword(e.target.value)}
          className="mt-1 block w-full border p-2 rounded"
          placeholder="••••••"
          required
        />
      </label>

      {error && <p className="text-red-500 text-sm mb-2">{error}</p>}

      <Button
        type="submit"
        label={isLoading ? 'Creating...' : 'Create Wallet'}
        size="md"
        variant="primary"
        className="w-full"
        disabled={isLoading}
      />
    </form>
  )
}
