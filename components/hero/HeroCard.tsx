// components/hero/HeroCard.tsx
'use client'

import { useState } from 'react'
import { useWalletPanels } from '../wallet/context/WalletPanelsContext'
import { useAljamaWallet } from '../wallet/context/WalletContext'
import { unlockWallet } from '@/lib/wallet'

type CreatedWalletData = {
  address: string
}

export default function Hero() {
  const { openPanels } = useWalletPanels()
  const { setWalletFromData } = useAljamaWallet()

  const [walletData, setWalletData] = useState<CreatedWalletData | null>(null)

  const createWallet = async () => {
    try {
      // TEMP UX: just use a prompt for the password.
      const passwordRaw =
        typeof window !== 'undefined'
          ? window.prompt('Set a password to encrypt your new wallet:')
          : null

      const password = passwordRaw?.trim()
      if (!password) {
        alert('Password is required to create a wallet.')
        return
      }

      const res = await fetch('/api/create-wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Failed to create wallet (${res.status})`)
      }

      const data: { address: string; encrypted: string } = await res.json()

      if (typeof window !== 'undefined') {
        sessionStorage.setItem('aljama.encryptedWallet', data.encrypted)
      }

      // Immediately unlock once to hydrate the global wallet context
      const unlocked = await unlockWallet({
        encrypted: data.encrypted,
        password,
      })

      // ✅ match the current type of setWalletFromData: { privateKey: string }
      setWalletFromData({
        privateKey: unlocked.privateKey,
      })

      // Simple confirmation modal – show address only
      setWalletData({ address: unlocked.address })
    } catch (err) {
      console.error('Wallet creation failed', err)
      alert('❌ Failed to create wallet.')
    }
  }

  return (
    <section className="relative h-screen overflow-x-hidden bg-no-repeat bg-cover bg-[position:center_bottom] animate-dunes flex items-center justify-center p-6 text-center">
      <div className="relative z-20 max-w-2xl animate-fade-in">
        <h1 className="text-4xl md:text-5xl font-extrabold text-[#faf3e0] tracking-tight leading-tight drop-shadow-xl font-display mb-4">
          Your Sacred Key to Web3
        </h1>
        <p className="text-lg md:text-xl font-medium italic text-[#faf3e0] tracking-tight leading-tight drop-shadow-md mb-6">
          Securely store, manage, and explore the decentralized world with Aljama Wallet.
        </p>
        <button
          onClick={createWallet}
          className="bg-[#d96f42] hover:bg-[#bf5f38] text-white px-8 py-4 rounded-full text-lg font-bold shadow-md hover:shadow-lg hover:scale-105 transition-all duration-300 relative overflow-hidden group"
        >
          <span className="relative z-10">Create Wallet</span>
          <span className="absolute inset-0 bg-white opacity-10 group-hover:opacity-20 blur-sm transition-all duration-500" />
        </button>
      </div>

      {walletData && (
        <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1a1a] text-white rounded-2xl p-6 max-w-md w-full shadow-xl border border-[#d96f42] space-y-4 animate-fade-in">
            <h2 className="text-2xl font-bold text-[#d96f42]">🪪 Wallet Created</h2>
            <div className="text-sm break-words">
              <p>
                <span className="font-semibold">Address:</span>
                <br />
                {walletData.address}
              </p>
              <p className="mt-2 text-xs text-gray-300">
                Your wallet has been encrypted with the password you chose.
                You&apos;ll need that password to unlock it on this device.
              </p>
            </div>
            <button
              onClick={() => setWalletData(null)}
              className="w-full mt-4 bg-[#d96f42] hover:bg-[#bf5f38] text-white py-2 px-4 rounded font-semibold transition"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
