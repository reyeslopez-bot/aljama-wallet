'use client'
import { useState } from 'react'
import Button from '@/components/Button'
import { useUnlockWallet } from '../../hooks/useUnlockWallet'

export default function UnlockForm() {
    const { unlock, isLoading, error } = useUnlockWallet()
    const [password, setPassword] = useState('')

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        await unlock(password)
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
                <span className="text-sm font-medium">Password</span>
                <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="mt-1 block w-full border p-2 rounded"
                    placeholder="••••••"
                    required
                />
            </label>
            {error && <p className="text-red-500">{error.message}</p>}
            <Button type="submit" label={isLoading ? 'Unlocking...' : 'Unlock'} disabled={isLoading} />
        </form>
    )
}

