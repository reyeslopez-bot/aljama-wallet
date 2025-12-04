// app/api/xrpl/dev-account/route.ts
import { NextResponse } from 'next/server'
import { getDevXrplAccount } from '@/lib/xrpl'

export async function GET() {
  try {
    const account = await getDevXrplAccount()
    return NextResponse.json({ ok: true, account })
  } catch (error: unknown) {
    console.error('XRPL dev-account error', error)

    const message =
      error instanceof Error ? error.message : 'XRPL error'

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    )
  }
}
