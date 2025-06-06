'use client'
import { useState } from 'react'
import Button from '@/components/ui/Button'
import { useUnlockWallet } from '@/lib/hooks/useUnlockWallet'

export default function UnlockForm() {
    const { unlock, isLoading, error } = useUnlockWallet()
    const [password, setPassword] = useState('')

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        await unlock(password)
    }

    return (
        <form onSubmit={handleSubmit} className="max-w-md mx-auto p-4 border-rounded-lg">
            <h2 className="text-xl font-bold mb-2">Unlock Wallet</h2>
            <label className="block mb-2">
                <span className="text-sm w-full border mt-1 font-medium mb-2">Password</span>
                <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="mt-1 mb-2 block w-full border p-2 rounded"
                    placeholder="••••••"
                    required
                />
            </label>
            {error && <p className="text-red-500">{error.message}</p>}
            <Button type="submit" label={isLoading ? 'Unlocking...' : 'Unlock'} disabled={isLoading} />
        </form>
    )
}

