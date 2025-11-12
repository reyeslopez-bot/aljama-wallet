'use client'

import { useState } from 'react'
import { parseEther, isAddress } from 'ethers' // v6 parseEther returns bigint
import { useAccount, useSendTransaction } from 'wagmi'

type Address = `0x${string}`;

function normalizeAddress(input: string): Address | null {
  const val = input.startsWith('0x') ? input : `0x${input}`;
  return isAddress(val) ? (val as Address) : null;
}
export default function SendTransactionForm() {
  const { address: from } = useAccount()
  const [toInput, setToInput] = useState<string>('');
  const [amount, setAmount] = useState('0')

  const { data, sendTransaction, isPending, error, status } = useSendTransaction()

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const to = normalizeAddress(toInput)
    if (!to) {
      // show validation error to user
      return;
    }

    const value = parseEther(amount || '0')
    sendTransaction({ to, value })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <label className="block text-sm">To</label>
        <input
          value={toInput}
          onChange={(e) => setToInput(e.target.value)}
          className="w-full rounded border px-3 py-2"
          placeholder="0x…"
        />
      </div>
      <div>
        <label className="block text-sm">Amount (ETH)</label>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full rounded border px-3 py-2"
          placeholder="0.01"
        />
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
      >
        {isPending ? 'Sending…' : 'Send'}
      </button>

      {from && <p className="text-xs text-gray-500">From: {from}</p>}
      {status === 'error' && <p className="text-red-600 text-sm">{String(error?.message ?? error)}</p>}
      {status === 'success' && <p className="text-green-600 text-sm">Tx: {String(data)}</p>}
    </form>
  )
}
