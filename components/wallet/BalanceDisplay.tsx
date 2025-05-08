// components/BalanceDisplay.tsx
'use client'

import { useBalance } from 'wagmi'

export default function BalanceDisplay({ address, className = '' }: {
    address: `0x${string}`
    className?: string
}) {
    const { data, isLoading } = useBalance({ address })

    if (isLoading) return <div className={className}> Loading...</div>

    return (
        <div className={className} >
            Balance: {data?.formatted} ETH
        </div>
    )
}

