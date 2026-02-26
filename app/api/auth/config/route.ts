import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json(
    { inviteRequired: false },
    { headers: { 'cache-control': 'no-store' } },
  )
}
