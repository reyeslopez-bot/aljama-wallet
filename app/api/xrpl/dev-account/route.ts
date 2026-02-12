// app/api/xrpl/dev-account/route.ts
import { NextResponse } from 'next/server'
import { getDevXrplAccount } from '@/lib/xrpl'
import { hasValidInternalToken } from '@/lib/security/internal-token'
import { isStrictMode } from '@/lib/security/runtime'

export async function GET(req: Request) {
  if (isStrictMode) {
    const expected = process.env.INTERNAL_API_TOKEN?.trim()
    if (!expected) {
      return NextResponse.json({ ok: false, error: 'DISABLED' }, { status: 404 })
    }
    if (!hasValidInternalToken(req, expected)) {
      return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })
    }
  }

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
