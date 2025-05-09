'use client'

import { useState } from 'react'
import { usePrepareSendTransaction, useSendTransaction } from 'wagmi'
import { parseEther } from 'ethers'

export default function SendTransactionForm() {
    const [to, setTo] = useState('')
    const [amount, setAmount] = useState('')

    const { config } = usePrepareSendTransaction({
        to,
        value: parseEther(amount || '0'),
        enabled: Boolean(to && amount),
    })

    const { sendTransaction, isLoading, isSuccess } = useSendTransaction(config)

    return (
        <form
            onSubmit={(e) => {
                e.preventDefault()
                sendTransaction?.()
            }}
            className="max-w-md mx-auto p-4 border rounded-lg"
        >
            <h2 className="text-xl font-bold mb-2">Send Transaction</h2>

            <label className="block mb-2">
                <span className="text-sm">Recipient address</span>
                <input
                    className="border p-2 w-full"
                    type="text"
                    placeholder="0x…"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                />
            </label>

            <label className="block mb-4">
                <span className="text-sm">Amount (ETH)</span>
                <input
                    className="border p-2 w-full"
                    type="number"
                    min="0"
                    step="0.0001"
                    placeholder="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                />
            </label>

            <button
                type="submit"
                className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
                disabled={isLoading}
            >
                {isLoading ? 'Sending…' : 'Send ETH'}
            </button>

            {isSuccess && <p className="text-green-500 mt-2">✅ Transaction sent!</p>}
        </form>
    )
}

