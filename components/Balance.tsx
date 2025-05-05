// components/Balance.tsx
'use client'

import { useAccount } from 'wagmi'
import BalanceDisplay from './BalanceDisplay'

export default function Balance() {
    const { address } = useAccount()

    if (!address) return null

    return <BalanceDisplay address={address} />
}

