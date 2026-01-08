import { NextResponse } from 'next/server'
import { isAddress } from 'viem'
import { getTokensByWallet } from '@/lib/getTokensByWallet'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const address = searchParams.get('address') ?? ''
  if (!isAddress(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 })
  }
  const tokens = await getTokensByWallet(address)
  return NextResponse.json({ address, tokens })
}
