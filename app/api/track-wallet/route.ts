import { NextResponse } from 'next/server'
import { getAddress, isAddress } from 'ethers'

type TrackWalletResponse = {
  address: string
  valid: boolean
  checksum: string | null
}

function buildResponse(address: string): TrackWalletResponse {
  const valid = isAddress(address)
  return {
    address,
    valid,
    checksum: valid ? getAddress(address) : null,
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const address = searchParams.get('address') ?? ''
  return NextResponse.json(buildResponse(address))
}

export async function POST(req: Request) {
  let address: unknown
  try {
    const body = await req.json()
    address = body?.address
  } catch (err) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (typeof address !== 'string' || address.trim() === '') {
    return NextResponse.json({ error: 'Address is required' }, { status: 400 })
  }

  return NextResponse.json(buildResponse(address))
}
