// app/api/create-wallet/route.ts
import { NextResponse } from 'next/server'
import { createEncryptedWallet } from '@/lib/wallet'
import { createWalletRecord } from '@/services/wallet.service'

export async function POST(req: Request) {
  try {
    const { password } = await req.json()

    if (!password || typeof password !== 'string' || !password.trim()) {
      return NextResponse.json(
        { error: 'Password is required' },
        { status: 400 },
      )
    }

    const { encrypted, wallet } = await createEncryptedWallet(password)

    const record = await createWalletRecord({
      address: wallet.address,
      privateKey: wallet.privateKey,
    })

    return NextResponse.json({
      walletId: record.id,
      address: wallet.address,
      encrypted, // canonical thing the client stores
      // no privateKey / mnemonic over the wire
    })
  } catch (error) {
    console.error('create-wallet error', error)
    return NextResponse.json(
      { error: 'Failed to create wallet' },
      { status: 500 },
    )
  }
}
