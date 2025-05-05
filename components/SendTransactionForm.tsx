// components/SendTransactionForm.tsx
'use client'

import { useState } from 'react'
import { parseEther } from 'viem'
import { usePrepareSendTransaction, useSendTransaction } from 'wagmi'

export default function SendTransactionForm() {
    const [to, setTo] = useState('')
    const [amount, setAmount] = useState('0.01')

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
        >
            <h2 className="text-xl font-bold mb-2">Send Transaction</h2>
            <input
                className="border p-2 mb-2 block w-full"
                type="text"
                placeholder="Recipient address"
                value={to}
                onChange={(e) => setTo(e.target.value)}
            />
            <input
                className="border p-2 mb-2 block w-full"
                type="text"
                placeholder="Amount in ETH"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
            />
            <button
                type="submit"
                className="bg-blue-500 text-white px-4 py-2 rounded"
                disabled={isLoading}
            >
                {isLoading ? 'Sending...' : 'Send ETH'}
            </button>

            {isSuccess && <p className="text-green-500 mt-2">Transaction sent!</p>}
        </form>
    )
}

