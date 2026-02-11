import { NextResponse } from 'next/server'
import { isAddress } from 'viem'
import { getTokensByWallet } from '@/lib/getTokensByWallet'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const address = searchParams.get('address') ?? ''
  const network = searchParams.get('network') ?? undefined
  if (!isAddress(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 })
  }
  try {
    const tokens = await getTokensByWallet(address, { network })
    return NextResponse.json({ address, network, tokens })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load tokens'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
