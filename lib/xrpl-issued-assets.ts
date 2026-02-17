import { dropsToXrp } from 'xrpl'
import { getXrplClient } from '@/infra/xrpl/client'
import { type XrplNetworkId } from '@/lib/xrpl-networks'

export type XrplNormalizedAsset = {
  assetType: 'xrp' | 'issued'
  currency: string
  issuer: string | null
  value: string
  limit: string | null
  qualityIn: number | null
  qualityOut: number | null
}

export type XrplAccountAssetsResult = {
  account: string
  network: XrplNetworkId
  assets: XrplNormalizedAsset[]
  filteredOut: number
  allowlistEnabled: boolean
}

function normalizeIssuer(value: string): string {
  return value.trim()
}

function parseAllowedIssuers(raw: string | undefined): Set<string> {
  if (!raw) return new Set()
  return new Set(
    raw
      .split(',')
      .map((issuer) => issuer.trim())
      .filter(Boolean)
      .map(normalizeIssuer),
  )
}

export function getAllowedIssuerSet() {
  const allowed = parseAllowedIssuers(process.env.XRPL_ALLOWED_ISSUERS)
  return {
    enabled: allowed.size > 0,
    allowed,
  }
}

function normalizeCurrency(input: string): string {
  const cleaned = input.trim()
  if (!cleaned) return 'UNKNOWN'
  return cleaned.toUpperCase()
}

function parseQuality(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

export async function getXrplAccountAssets(params: {
  networkId: XrplNetworkId
  account: string
}): Promise<XrplAccountAssetsResult> {
  const client = await getXrplClient(params.networkId)

  const [accountInfoRes, accountLinesRes] = await Promise.all([
    client.request({
      command: 'account_info',
      account: params.account,
      ledger_index: 'validated',
    }),
    client.request({
      command: 'account_lines',
      account: params.account,
      ledger_index: 'validated',
      limit: 400,
    }),
  ])

  const balanceDrops = String(
    (accountInfoRes.result as { account_data?: { Balance?: string } }).account_data?.Balance ?? '0',
  )
  const xrpAsset: XrplNormalizedAsset = {
    assetType: 'xrp',
    currency: 'XRP',
    issuer: null,
    value: String(dropsToXrp(balanceDrops)),
    limit: null,
    qualityIn: null,
    qualityOut: null,
  }

  const { enabled, allowed } = getAllowedIssuerSet()
  const rawLines = ((accountLinesRes.result as { lines?: unknown[] }).lines ?? []) as Array<{
    account?: string
    currency?: string
    balance?: string
    limit?: string
    quality_in?: number | string
    quality_out?: number | string
  }>

  let filteredOut = 0
  const issuedAssets: XrplNormalizedAsset[] = []

  for (const line of rawLines) {
    const issuer = normalizeIssuer(line.account ?? '')
    if (!issuer) continue

    if (enabled && !allowed.has(issuer)) {
      filteredOut += 1
      continue
    }

    issuedAssets.push({
      assetType: 'issued',
      currency: normalizeCurrency(line.currency ?? 'UNKNOWN'),
      issuer,
      value: String(line.balance ?? '0'),
      limit: typeof line.limit === 'string' ? line.limit : null,
      qualityIn: parseQuality(line.quality_in),
      qualityOut: parseQuality(line.quality_out),
    })
  }

  return {
    account: params.account,
    network: params.networkId,
    assets: [xrpAsset, ...issuedAssets],
    filteredOut,
    allowlistEnabled: enabled,
  }
}
