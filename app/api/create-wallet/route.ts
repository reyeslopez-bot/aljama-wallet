// app/api/create-wallet/route.ts
import { NextResponse } from 'next/server'
import { Wallet } from 'ethers'

export async function POST() {
  const wallet = Wallet.createRandom()

  const phrase = wallet.mnemonic?.phrase ?? null
  if (!phrase) {
    return NextResponse.json(
      { error: 'Mnemonic unavailable' },
      { status: 500 },
    )
  }

  return NextResponse.json({
    address: wallet.address,
    privateKey: wallet.privateKey,
    mnemonic: phrase,
  })
}
