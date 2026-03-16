import { randomUUID } from 'node:crypto'
import { prismaPg } from '@/lib/prisma-pg'
import { logWarn } from '@/lib/security/logging'
import { isStrictMode } from '@/lib/security/runtime'
import { Prisma } from '@/prisma/generated/pg'

export const XRPL_ISSUER_PROGRAM_STATUSES = ['draft', 'active', 'paused', 'archived'] as const
export const XRPL_ISSUER_ASSET_STATUSES = ['draft', 'active', 'paused', 'archived'] as const
export const XRPL_ISSUER_HOLDER_STATUSES = ['pending', 'approved', 'authorized', 'rejected', 'revoked'] as const
export const XRPL_ISSUER_REVIEWABLE_HOLDER_STATUSES = ['pending', 'approved', 'rejected', 'revoked'] as const
export const XRPL_ISSUER_DISTRIBUTION_STATUSES = ['queued', 'submitted', 'validated', 'failed'] as const

export type XrplIssuerProgramStatus = (typeof XRPL_ISSUER_PROGRAM_STATUSES)[number]
export type XrplIssuerAssetStatus = (typeof XRPL_ISSUER_ASSET_STATUSES)[number]
export type XrplIssuerHolderStatus = (typeof XRPL_ISSUER_HOLDER_STATUSES)[number]
export type XrplIssuerReviewableHolderStatus = (typeof XRPL_ISSUER_REVIEWABLE_HOLDER_STATUSES)[number]
export type XrplIssuerDistributionStatus = (typeof XRPL_ISSUER_DISTRIBUTION_STATUSES)[number]

export type XrplIssuerProgramRecord = {
  id: string
  networkId: string
  issuerAccount: string
  distributorAccount: string | null
  status: XrplIssuerProgramStatus
  name: string | null
  domain: string | null
  transferFeeBps: number | null
  tickSize: number | null
  requiresAuthorizedTrustlines: boolean
  allowDistributions: boolean
  metadata: Record<string, unknown> | null
  createdByUserId: string | null
  createdAt: string
  updatedAt: string
}

export type XrplIssuerAssetRecord = {
  id: string
  programId: string
  currency: string
  status: XrplIssuerAssetStatus
  displayName: string | null
  precision: number | null
  trustlineLimit: string | null
  distributionsEnabled: boolean
  requireHolderApproval: boolean
  maxDistributionValue: string | null
  metadata: Record<string, unknown> | null
  createdByUserId: string | null
  createdAt: string
  updatedAt: string
}

export type XrplIssuerHolderRecord = {
  id: string
  assetId: string
  holderAddress: string
  status: XrplIssuerHolderStatus
  approvedByUserId: string | null
  approvedAt: string | null
  revokedAt: string | null
  lastAuthorizedAt: string | null
  lastDistributionAt: string | null
  notes: string | null
  reviewContext: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export type XrplIssuerDistributionRecord = {
  id: string
  programId: string
  assetId: string
  holderId: string | null
  actionId: string | null
  destinationAddress: string
  amount: string
  status: XrplIssuerDistributionStatus
  idempotencyKey: string | null
  txHash: string | null
  failureCode: string | null
  requestedByUserId: string | null
  requestedAt: string
  submittedAt: string | null
  validatedAt: string | null
  details: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export type XrplIssuerAssetPolicyRecord = {
  program: XrplIssuerProgramRecord
  asset: XrplIssuerAssetRecord
  holder: XrplIssuerHolderRecord | null
}

export type UpsertXrplIssuerProgramInput = {
  networkId: string
  issuerAccount: string
  distributorAccount?: string | null
  status?: XrplIssuerProgramStatus
  name?: string | null
  domain?: string | null
  transferFeeBps?: number | null
  tickSize?: number | null
  requiresAuthorizedTrustlines?: boolean
  allowDistributions?: boolean
  metadata?: Record<string, unknown> | null
  createdByUserId?: string | null
}

export type UpsertXrplIssuerAssetInput = {
  networkId: string
  issuerAccount: string
  currency: string
  program?: Omit<UpsertXrplIssuerProgramInput, 'networkId' | 'issuerAccount'>
  status?: XrplIssuerAssetStatus
  displayName?: string | null
  precision?: number | null
  trustlineLimit?: string | null
  distributionsEnabled?: boolean
  requireHolderApproval?: boolean
  maxDistributionValue?: string | null
  metadata?: Record<string, unknown> | null
  createdByUserId?: string | null
}

export type ReviewXrplIssuerHolderInput = {
  networkId: string
  issuerAccount: string
  currency: string
  holderAddress: string
  status: XrplIssuerReviewableHolderStatus
  approvedByUserId?: string | null
  notes?: string | null
  reviewContext?: Record<string, unknown> | null
}

type RequireXrplIssuerHolderEligibilityInput = {
  networkId: string
  issuerAccount: string
  currency: string
  holderAddress: string
  action: 'authorize' | 'distribute'
  amount?: string
}

type CreateXrplIssuerDistributionInput = {
  networkId: string
  issuerAccount: string
  currency: string
  destinationAddress: string
  amount: string
  actionId?: string | null
  idempotencyKey?: string | null
  requestedByUserId?: string | null
  details?: Record<string, unknown> | null
}

type UpdateXrplIssuerDistributionInput = {
  distributionId: string
  status: XrplIssuerDistributionStatus
  txHash?: string | null
  failureCode?: string | null
  details?: Record<string, unknown> | null
}

const globalForIssuerPolicy = globalThis as unknown as {
  xrplIssuerPrograms?: Map<string, XrplIssuerProgramRecord>
  xrplIssuerAssets?: Map<string, XrplIssuerAssetRecord>
  xrplIssuerHolders?: Map<string, XrplIssuerHolderRecord>
  xrplIssuerDistributions?: Map<string, XrplIssuerDistributionRecord>
}

const memoryPrograms = globalForIssuerPolicy.xrplIssuerPrograms ?? new Map<string, XrplIssuerProgramRecord>()
const memoryAssets = globalForIssuerPolicy.xrplIssuerAssets ?? new Map<string, XrplIssuerAssetRecord>()
const memoryHolders = globalForIssuerPolicy.xrplIssuerHolders ?? new Map<string, XrplIssuerHolderRecord>()
const memoryDistributions =
  globalForIssuerPolicy.xrplIssuerDistributions ?? new Map<string, XrplIssuerDistributionRecord>()

if (!globalForIssuerPolicy.xrplIssuerPrograms) {
  globalForIssuerPolicy.xrplIssuerPrograms = memoryPrograms
}
if (!globalForIssuerPolicy.xrplIssuerAssets) {
  globalForIssuerPolicy.xrplIssuerAssets = memoryAssets
}
if (!globalForIssuerPolicy.xrplIssuerHolders) {
  globalForIssuerPolicy.xrplIssuerHolders = memoryHolders
}
if (!globalForIssuerPolicy.xrplIssuerDistributions) {
  globalForIssuerPolicy.xrplIssuerDistributions = memoryDistributions
}

function canUsePg() {
  return Boolean(process.env.PG_DATABASE_URL ?? process.env.POSTGRES_URL)
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

function fromJsonRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function toIso(value: Date | string | null | undefined) {
  if (!value) return null
  return typeof value === 'string' ? new Date(value).toISOString() : value.toISOString()
}

function nowIso() {
  return new Date().toISOString()
}

function normalizeDecimalString(value: string): string {
  const trimmed = value.trim()
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error('Amount must be a positive decimal string')
  }

  const [rawWhole, rawFraction = ''] = trimmed.split('.')
  const whole = rawWhole.replace(/^0+(?=\d)/, '') || '0'
  const fraction = rawFraction.replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : whole
}

function compareDecimalStrings(left: string, right: string): number {
  const [leftWhole, leftFraction = ''] = normalizeDecimalString(left).split('.')
  const [rightWhole, rightFraction = ''] = normalizeDecimalString(right).split('.')

  if (leftWhole.length !== rightWhole.length) {
    return leftWhole.length > rightWhole.length ? 1 : -1
  }
  if (leftWhole !== rightWhole) {
    return leftWhole > rightWhole ? 1 : -1
  }

  const scale = Math.max(leftFraction.length, rightFraction.length)
  const leftScaled = leftFraction.padEnd(scale, '0')
  const rightScaled = rightFraction.padEnd(scale, '0')
  if (leftScaled === rightScaled) return 0
  return leftScaled > rightScaled ? 1 : -1
}

function rowToProgramRecord(row: {
  id: string
  networkId: string
  issuerAccount: string
  distributorAccount: string | null
  status: string
  name: string | null
  domain: string | null
  transferFeeBps: number | null
  tickSize: number | null
  requiresAuthorizedTrustlines: boolean
  allowDistributions: boolean
  metadata: unknown
  createdByUserId: string | null
  createdAt: Date
  updatedAt: Date
}): XrplIssuerProgramRecord {
  return {
    id: row.id,
    networkId: row.networkId,
    issuerAccount: row.issuerAccount,
    distributorAccount: row.distributorAccount,
    status: row.status as XrplIssuerProgramStatus,
    name: row.name,
    domain: row.domain,
    transferFeeBps: row.transferFeeBps,
    tickSize: row.tickSize,
    requiresAuthorizedTrustlines: row.requiresAuthorizedTrustlines,
    allowDistributions: row.allowDistributions,
    metadata: fromJsonRecord(row.metadata),
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function rowToAssetRecord(row: {
  id: string
  programId: string
  currency: string
  status: string
  displayName: string | null
  precision: number | null
  trustlineLimit: string | null
  distributionsEnabled: boolean
  requireHolderApproval: boolean
  maxDistributionValue: string | null
  metadata: unknown
  createdByUserId: string | null
  createdAt: Date
  updatedAt: Date
}): XrplIssuerAssetRecord {
  return {
    id: row.id,
    programId: row.programId,
    currency: row.currency,
    status: row.status as XrplIssuerAssetStatus,
    displayName: row.displayName,
    precision: row.precision,
    trustlineLimit: row.trustlineLimit,
    distributionsEnabled: row.distributionsEnabled,
    requireHolderApproval: row.requireHolderApproval,
    maxDistributionValue: row.maxDistributionValue,
    metadata: fromJsonRecord(row.metadata),
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function rowToHolderRecord(row: {
  id: string
  assetId: string
  holderAddress: string
  status: string
  approvedByUserId: string | null
  approvedAt: Date | null
  revokedAt: Date | null
  lastAuthorizedAt: Date | null
  lastDistributionAt: Date | null
  notes: string | null
  reviewContext: unknown
  createdAt: Date
  updatedAt: Date
}): XrplIssuerHolderRecord {
  return {
    id: row.id,
    assetId: row.assetId,
    holderAddress: row.holderAddress,
    status: row.status as XrplIssuerHolderStatus,
    approvedByUserId: row.approvedByUserId,
    approvedAt: toIso(row.approvedAt),
    revokedAt: toIso(row.revokedAt),
    lastAuthorizedAt: toIso(row.lastAuthorizedAt),
    lastDistributionAt: toIso(row.lastDistributionAt),
    notes: row.notes,
    reviewContext: fromJsonRecord(row.reviewContext),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function rowToDistributionRecord(row: {
  id: string
  programId: string
  assetId: string
  holderId: string | null
  actionId: string | null
  destinationAddress: string
  amount: string
  status: string
  idempotencyKey: string | null
  txHash: string | null
  failureCode: string | null
  requestedByUserId: string | null
  requestedAt: Date
  submittedAt: Date | null
  validatedAt: Date | null
  details: unknown
  createdAt: Date
  updatedAt: Date
}): XrplIssuerDistributionRecord {
  return {
    id: row.id,
    programId: row.programId,
    assetId: row.assetId,
    holderId: row.holderId,
    actionId: row.actionId,
    destinationAddress: row.destinationAddress,
    amount: row.amount,
    status: row.status as XrplIssuerDistributionStatus,
    idempotencyKey: row.idempotencyKey,
    txHash: row.txHash,
    failureCode: row.failureCode,
    requestedByUserId: row.requestedByUserId,
    requestedAt: row.requestedAt.toISOString(),
    submittedAt: toIso(row.submittedAt),
    validatedAt: toIso(row.validatedAt),
    details: fromJsonRecord(row.details),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function cacheProgram(record: XrplIssuerProgramRecord) {
  memoryPrograms.set(record.id, record)
}

function cacheAsset(record: XrplIssuerAssetRecord) {
  memoryAssets.set(record.id, record)
}

function cacheHolder(record: XrplIssuerHolderRecord) {
  memoryHolders.set(record.id, record)
}

function cacheDistribution(record: XrplIssuerDistributionRecord) {
  memoryDistributions.set(record.id, record)
}

function findProgramInMemory(networkId: string, issuerAccount: string) {
  return Array.from(memoryPrograms.values()).find(
    (record) => record.networkId === networkId && record.issuerAccount === issuerAccount,
  ) ?? null
}

function findAssetInMemory(programId: string, currency: string) {
  return Array.from(memoryAssets.values()).find(
    (record) => record.programId === programId && record.currency === currency,
  ) ?? null
}

function findHolderInMemory(assetId: string, holderAddress: string) {
  return Array.from(memoryHolders.values()).find(
    (record) => record.assetId === assetId && record.holderAddress === holderAddress,
  ) ?? null
}

async function withPgFallback<T>(label: string, work: () => Promise<T>, fallback: () => T | Promise<T>): Promise<T> {
  if (!canUsePg()) return await fallback()

  try {
    return await work()
  } catch (error) {
    if (isStrictMode) throw error
    logWarn(label, error)
    return await fallback()
  }
}

function buildProgramCreateData(input: UpsertXrplIssuerProgramInput) {
  return {
    networkId: input.networkId,
    issuerAccount: input.issuerAccount,
    status: input.status ?? 'active',
    ...(input.distributorAccount !== undefined ? { distributorAccount: input.distributorAccount } : {}),
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.domain !== undefined ? { domain: input.domain } : {}),
    ...(input.transferFeeBps !== undefined ? { transferFeeBps: input.transferFeeBps } : {}),
    ...(input.tickSize !== undefined ? { tickSize: input.tickSize } : {}),
    ...(input.requiresAuthorizedTrustlines !== undefined
      ? { requiresAuthorizedTrustlines: input.requiresAuthorizedTrustlines }
      : {}),
    ...(input.allowDistributions !== undefined ? { allowDistributions: input.allowDistributions } : {}),
    ...(input.metadata !== undefined ? { metadata: input.metadata ? toJson(input.metadata) : Prisma.JsonNull } : {}),
    ...(input.createdByUserId !== undefined ? { createdByUserId: input.createdByUserId } : {}),
  }
}

function buildProgramUpdateData(input: UpsertXrplIssuerProgramInput) {
  return {
    ...(input.distributorAccount !== undefined ? { distributorAccount: input.distributorAccount } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.domain !== undefined ? { domain: input.domain } : {}),
    ...(input.transferFeeBps !== undefined ? { transferFeeBps: input.transferFeeBps } : {}),
    ...(input.tickSize !== undefined ? { tickSize: input.tickSize } : {}),
    ...(input.requiresAuthorizedTrustlines !== undefined
      ? { requiresAuthorizedTrustlines: input.requiresAuthorizedTrustlines }
      : {}),
    ...(input.allowDistributions !== undefined ? { allowDistributions: input.allowDistributions } : {}),
    ...(input.metadata !== undefined ? { metadata: input.metadata ? toJson(input.metadata) : Prisma.JsonNull } : {}),
    ...(input.createdByUserId !== undefined ? { createdByUserId: input.createdByUserId } : {}),
  }
}

function buildAssetCreateData(programId: string, input: UpsertXrplIssuerAssetInput) {
  return {
    programId,
    currency: input.currency,
    status: input.status ?? 'active',
    ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
    ...(input.precision !== undefined ? { precision: input.precision } : {}),
    ...(input.trustlineLimit !== undefined ? { trustlineLimit: input.trustlineLimit } : {}),
    ...(input.distributionsEnabled !== undefined ? { distributionsEnabled: input.distributionsEnabled } : {}),
    ...(input.requireHolderApproval !== undefined ? { requireHolderApproval: input.requireHolderApproval } : {}),
    ...(input.maxDistributionValue !== undefined ? { maxDistributionValue: input.maxDistributionValue } : {}),
    ...(input.metadata !== undefined ? { metadata: input.metadata ? toJson(input.metadata) : Prisma.JsonNull } : {}),
    ...(input.createdByUserId !== undefined ? { createdByUserId: input.createdByUserId } : {}),
  }
}

function buildAssetUpdateData(input: UpsertXrplIssuerAssetInput) {
  return {
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
    ...(input.precision !== undefined ? { precision: input.precision } : {}),
    ...(input.trustlineLimit !== undefined ? { trustlineLimit: input.trustlineLimit } : {}),
    ...(input.distributionsEnabled !== undefined ? { distributionsEnabled: input.distributionsEnabled } : {}),
    ...(input.requireHolderApproval !== undefined ? { requireHolderApproval: input.requireHolderApproval } : {}),
    ...(input.maxDistributionValue !== undefined ? { maxDistributionValue: input.maxDistributionValue } : {}),
    ...(input.metadata !== undefined ? { metadata: input.metadata ? toJson(input.metadata) : Prisma.JsonNull } : {}),
    ...(input.createdByUserId !== undefined ? { createdByUserId: input.createdByUserId } : {}),
  }
}

function buildHolderUpdateData(input: ReviewXrplIssuerHolderInput, existing: XrplIssuerHolderRecord | null) {
  const now = new Date()
  if (input.status === 'approved') {
    return {
      status: 'approved' as const,
      approvedByUserId: input.approvedByUserId ?? existing?.approvedByUserId ?? null,
      approvedAt: existing?.approvedAt ? new Date(existing.approvedAt) : now,
      revokedAt: null,
      notes: input.notes ?? null,
      reviewContext: input.reviewContext ? toJson(input.reviewContext) : Prisma.JsonNull,
    }
  }

  if (input.status === 'revoked') {
    return {
      status: 'revoked' as const,
      revokedAt: now,
      notes: input.notes ?? null,
      reviewContext: input.reviewContext ? toJson(input.reviewContext) : Prisma.JsonNull,
    }
  }

  return {
    status: input.status,
    approvedByUserId: input.status === 'pending' ? null : existing?.approvedByUserId ?? null,
    approvedAt: input.status === 'pending' ? null : existing?.approvedAt ? new Date(existing.approvedAt) : null,
    revokedAt: null,
    notes: input.notes ?? null,
    reviewContext: input.reviewContext ? toJson(input.reviewContext) : Prisma.JsonNull,
  }
}

async function getAssetPolicyFromPg(input: {
  networkId: string
  issuerAccount: string
  currency: string
  holderAddress?: string
}): Promise<XrplIssuerAssetPolicyRecord | null> {
  const programRow = await prismaPg.xrplIssuerProgram.findUnique({
    where: {
      networkId_issuerAccount: {
        networkId: input.networkId,
        issuerAccount: input.issuerAccount,
      },
    },
  })
  if (!programRow) return null

  const assetRow = await prismaPg.xrplIssuerAsset.findUnique({
    where: {
      programId_currency: {
        programId: programRow.id,
        currency: input.currency,
      },
    },
  })
  if (!assetRow) return null

  const holderRow = input.holderAddress
    ? await prismaPg.xrplIssuerHolder.findUnique({
        where: {
          assetId_holderAddress: {
            assetId: assetRow.id,
            holderAddress: input.holderAddress,
          },
        },
      })
    : null

  const program = rowToProgramRecord(programRow)
  const asset = rowToAssetRecord(assetRow)
  const holder = holderRow ? rowToHolderRecord(holderRow) : null
  cacheProgram(program)
  cacheAsset(asset)
  if (holder) cacheHolder(holder)

  return { program, asset, holder }
}

function getAssetPolicyFromMemory(input: {
  networkId: string
  issuerAccount: string
  currency: string
  holderAddress?: string
}): XrplIssuerAssetPolicyRecord | null {
  const program = findProgramInMemory(input.networkId, input.issuerAccount)
  if (!program) return null

  const asset = findAssetInMemory(program.id, input.currency)
  if (!asset) return null

  const holder = input.holderAddress ? findHolderInMemory(asset.id, input.holderAddress) : null
  return { program, asset, holder }
}

function assertActivePolicy(policy: XrplIssuerAssetPolicyRecord | null) {
  if (!policy) {
    throw new Error('Issuer asset is not registered')
  }
  if (policy.program.status !== 'active') {
    throw new Error('Issuer program is not active')
  }
  if (policy.asset.status !== 'active') {
    throw new Error('Issuer asset is not active')
  }
}

function assertHolderApprovalForAuthorization(policy: XrplIssuerAssetPolicyRecord) {
  const approvalRequired =
    policy.program.requiresAuthorizedTrustlines || policy.asset.requireHolderApproval

  if (!approvalRequired) {
    return
  }

  if (!policy.holder) {
    throw new Error('Holder is not approved for this asset')
  }
  if (policy.holder.status === 'revoked' || policy.holder.status === 'rejected') {
    throw new Error('Holder is not approved for this asset')
  }
  if (policy.holder.status !== 'approved' && policy.holder.status !== 'authorized') {
    throw new Error('Holder is not approved for this asset')
  }
}

function assertHolderApprovalForDistribution(policy: XrplIssuerAssetPolicyRecord, amount?: string) {
  if (!policy.program.allowDistributions) {
    throw new Error('Issuer program does not allow distributions')
  }
  if (!policy.asset.distributionsEnabled) {
    throw new Error('Issuer distributions are disabled for this asset')
  }

  if (policy.asset.maxDistributionValue && amount && compareDecimalStrings(amount, policy.asset.maxDistributionValue) > 0) {
    throw new Error('Distribution amount exceeds the configured asset limit')
  }

  if (policy.program.requiresAuthorizedTrustlines) {
    if (!policy.holder || policy.holder.status !== 'authorized') {
      throw new Error('Holder trustline is not authorized for this asset')
    }
    return
  }

  if (!policy.asset.requireHolderApproval) {
    return
  }

  if (!policy.holder) {
    throw new Error('Holder is not approved for this asset')
  }
  if (policy.holder.status !== 'approved' && policy.holder.status !== 'authorized') {
    throw new Error('Holder is not approved for this asset')
  }
}

export async function upsertXrplIssuerProgram(input: UpsertXrplIssuerProgramInput): Promise<XrplIssuerProgramRecord> {
  return withPgFallback(
    'xrpl-issuer-policy:program-upsert',
    async () => {
      const row = await prismaPg.xrplIssuerProgram.upsert({
        where: {
          networkId_issuerAccount: {
            networkId: input.networkId,
            issuerAccount: input.issuerAccount,
          },
        },
        create: buildProgramCreateData(input),
        update: buildProgramUpdateData(input),
      })
      const record = rowToProgramRecord(row)
      cacheProgram(record)
      return record
    },
    () => {
      const existing = findProgramInMemory(input.networkId, input.issuerAccount)
      const now = nowIso()
      const record: XrplIssuerProgramRecord = {
        id: existing?.id ?? randomUUID(),
        networkId: input.networkId,
        issuerAccount: input.issuerAccount,
        distributorAccount:
          input.distributorAccount !== undefined ? input.distributorAccount : existing?.distributorAccount ?? null,
        status: input.status ?? existing?.status ?? 'active',
        name: input.name !== undefined ? input.name : existing?.name ?? null,
        domain: input.domain !== undefined ? input.domain : existing?.domain ?? null,
        transferFeeBps:
          input.transferFeeBps !== undefined ? input.transferFeeBps : existing?.transferFeeBps ?? null,
        tickSize: input.tickSize !== undefined ? input.tickSize : existing?.tickSize ?? null,
        requiresAuthorizedTrustlines:
          input.requiresAuthorizedTrustlines !== undefined
            ? input.requiresAuthorizedTrustlines
            : existing?.requiresAuthorizedTrustlines ?? true,
        allowDistributions:
          input.allowDistributions !== undefined ? input.allowDistributions : existing?.allowDistributions ?? true,
        metadata: input.metadata !== undefined ? input.metadata : existing?.metadata ?? null,
        createdByUserId:
          input.createdByUserId !== undefined ? input.createdByUserId : existing?.createdByUserId ?? null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      }
      cacheProgram(record)
      return record
    },
  )
}

export async function upsertXrplIssuerAsset(input: UpsertXrplIssuerAssetInput): Promise<XrplIssuerAssetPolicyRecord> {
  const program = await upsertXrplIssuerProgram({
    networkId: input.networkId,
    issuerAccount: input.issuerAccount,
    ...(input.program ?? {}),
    ...(input.createdByUserId !== undefined && input.program?.createdByUserId === undefined
      ? { createdByUserId: input.createdByUserId }
      : {}),
  })

  const asset = await withPgFallback(
    'xrpl-issuer-policy:asset-upsert',
    async () => {
      const row = await prismaPg.xrplIssuerAsset.upsert({
        where: {
          programId_currency: {
            programId: program.id,
            currency: input.currency,
          },
        },
        create: buildAssetCreateData(program.id, input),
        update: buildAssetUpdateData(input),
      })
      const record = rowToAssetRecord(row)
      cacheAsset(record)
      return record
    },
    () => {
      const existing = findAssetInMemory(program.id, input.currency)
      const now = nowIso()
      const record: XrplIssuerAssetRecord = {
        id: existing?.id ?? randomUUID(),
        programId: program.id,
        currency: input.currency,
        status: input.status ?? existing?.status ?? 'active',
        displayName: input.displayName !== undefined ? input.displayName : existing?.displayName ?? null,
        precision: input.precision !== undefined ? input.precision : existing?.precision ?? null,
        trustlineLimit:
          input.trustlineLimit !== undefined ? input.trustlineLimit : existing?.trustlineLimit ?? null,
        distributionsEnabled:
          input.distributionsEnabled !== undefined
            ? input.distributionsEnabled
            : existing?.distributionsEnabled ?? true,
        requireHolderApproval:
          input.requireHolderApproval !== undefined
            ? input.requireHolderApproval
            : existing?.requireHolderApproval ?? true,
        maxDistributionValue:
          input.maxDistributionValue !== undefined
            ? input.maxDistributionValue
            : existing?.maxDistributionValue ?? null,
        metadata: input.metadata !== undefined ? input.metadata : existing?.metadata ?? null,
        createdByUserId:
          input.createdByUserId !== undefined ? input.createdByUserId : existing?.createdByUserId ?? null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      }
      cacheAsset(record)
      return record
    },
  )

  return {
    program,
    asset,
    holder: null,
  }
}

export async function getXrplIssuerAssetPolicy(input: {
  networkId: string
  issuerAccount: string
  currency: string
  holderAddress?: string
}): Promise<XrplIssuerAssetPolicyRecord | null> {
  return withPgFallback(
    'xrpl-issuer-policy:asset-policy',
    () => getAssetPolicyFromPg(input),
    () => getAssetPolicyFromMemory(input),
  )
}

export async function reviewXrplIssuerHolder(input: ReviewXrplIssuerHolderInput): Promise<XrplIssuerHolderRecord> {
  const policy = await getXrplIssuerAssetPolicy({
    networkId: input.networkId,
    issuerAccount: input.issuerAccount,
    currency: input.currency,
    holderAddress: input.holderAddress,
  })
  assertActivePolicy(policy)

  return withPgFallback(
    'xrpl-issuer-policy:holder-review',
    async () => {
      const existing = policy.holder
      const row = await prismaPg.xrplIssuerHolder.upsert({
        where: {
          assetId_holderAddress: {
            assetId: policy.asset.id,
            holderAddress: input.holderAddress,
          },
        },
        create: {
          assetId: policy.asset.id,
          holderAddress: input.holderAddress,
          ...buildHolderUpdateData(input, existing),
        },
        update: buildHolderUpdateData(input, existing),
      })
      const record = rowToHolderRecord(row)
      cacheHolder(record)
      return record
    },
    () => {
      const existing = policy.holder
      const now = nowIso()
      const reviewData = buildHolderUpdateData(input, existing)
      const record: XrplIssuerHolderRecord = {
        id: existing?.id ?? randomUUID(),
        assetId: policy.asset.id,
        holderAddress: input.holderAddress,
        status: reviewData.status,
        approvedByUserId:
          'approvedByUserId' in reviewData ? (reviewData.approvedByUserId ?? null) : existing?.approvedByUserId ?? null,
        approvedAt:
          'approvedAt' in reviewData
            ? toIso(reviewData.approvedAt as Date | null | undefined)
            : existing?.approvedAt ?? null,
        revokedAt:
          'revokedAt' in reviewData
            ? toIso(reviewData.revokedAt as Date | null | undefined)
            : existing?.revokedAt ?? null,
        lastAuthorizedAt: existing?.lastAuthorizedAt ?? null,
        lastDistributionAt: existing?.lastDistributionAt ?? null,
        notes: (reviewData.notes as string | null | undefined) ?? null,
        reviewContext:
          reviewData.reviewContext === Prisma.JsonNull
            ? null
            : (reviewData.reviewContext as Record<string, unknown> | null | undefined) ?? null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      }
      cacheHolder(record)
      return record
    },
  )
}

export async function requireXrplIssuerHolderEligibility(
  input: RequireXrplIssuerHolderEligibilityInput,
): Promise<XrplIssuerAssetPolicyRecord> {
  const policy = await getXrplIssuerAssetPolicy({
    networkId: input.networkId,
    issuerAccount: input.issuerAccount,
    currency: input.currency,
    holderAddress: input.holderAddress,
  })
  assertActivePolicy(policy)

  // Authorization and distribution intentionally diverge here:
  // authorization requires a prior compliance approval, while distribution
  // may require the stronger "authorized" state when the program enforces
  // RequireAuth-style trustline policy.
  if (input.action === 'authorize') {
    assertHolderApprovalForAuthorization(policy)
  } else {
    assertHolderApprovalForDistribution(policy, input.amount)
  }

  return policy
}

export async function markXrplIssuerHolderAuthorized(input: {
  assetId: string
  holderAddress: string
}): Promise<XrplIssuerHolderRecord> {
  const existing = await withPgFallback(
    'xrpl-issuer-policy:holder-authorized-read',
    async () => {
      const row = await prismaPg.xrplIssuerHolder.findUnique({
        where: {
          assetId_holderAddress: {
            assetId: input.assetId,
            holderAddress: input.holderAddress,
          },
        },
      })
      return row ? rowToHolderRecord(row) : null
    },
    () => findHolderInMemory(input.assetId, input.holderAddress),
  )

  const now = new Date()

  return withPgFallback(
    'xrpl-issuer-policy:holder-authorized-write',
    async () => {
      const row = existing
        ? await prismaPg.xrplIssuerHolder.update({
            where: {
              assetId_holderAddress: {
                assetId: input.assetId,
                holderAddress: input.holderAddress,
              },
            },
            data: {
              status: 'authorized',
              lastAuthorizedAt: now,
            },
          })
        : await prismaPg.xrplIssuerHolder.create({
            data: {
              assetId: input.assetId,
              holderAddress: input.holderAddress,
              status: 'authorized',
              lastAuthorizedAt: now,
            },
          })
      const record = rowToHolderRecord(row)
      cacheHolder(record)
      return record
    },
    () => {
      const nowIsoValue = now.toISOString()
      const record: XrplIssuerHolderRecord = {
        id: existing?.id ?? randomUUID(),
        assetId: input.assetId,
        holderAddress: input.holderAddress,
        status: 'authorized',
        approvedByUserId: existing?.approvedByUserId ?? null,
        approvedAt: existing?.approvedAt ?? null,
        revokedAt: null,
        lastAuthorizedAt: nowIsoValue,
        lastDistributionAt: existing?.lastDistributionAt ?? null,
        notes: existing?.notes ?? null,
        reviewContext: existing?.reviewContext ?? null,
        createdAt: existing?.createdAt ?? nowIsoValue,
        updatedAt: nowIsoValue,
      }
      cacheHolder(record)
      return record
    },
  )
}

export async function createXrplIssuerDistribution(input: CreateXrplIssuerDistributionInput) {
  const policy = await requireXrplIssuerHolderEligibility({
    networkId: input.networkId,
    issuerAccount: input.issuerAccount,
    currency: input.currency,
    holderAddress: input.destinationAddress,
    action: 'distribute',
    amount: input.amount,
  })

  return withPgFallback(
    'xrpl-issuer-policy:distribution-create',
    async () => {
      const row = await prismaPg.xrplIssuerDistribution.create({
        data: {
          programId: policy.program.id,
          assetId: policy.asset.id,
          holderId: policy.holder?.id ?? null,
          actionId: input.actionId ?? null,
          destinationAddress: input.destinationAddress,
          amount: input.amount,
          status: 'queued',
          idempotencyKey: input.idempotencyKey ?? null,
          requestedByUserId: input.requestedByUserId ?? null,
          details: input.details ? toJson(input.details) : undefined,
        },
      })
      const record = rowToDistributionRecord(row)
      cacheDistribution(record)
      return { policy, distribution: record }
    },
    () => {
      const now = nowIso()
      const record: XrplIssuerDistributionRecord = {
        id: randomUUID(),
        programId: policy.program.id,
        assetId: policy.asset.id,
        holderId: policy.holder?.id ?? null,
        actionId: input.actionId ?? null,
        destinationAddress: input.destinationAddress,
        amount: input.amount,
        status: 'queued',
        idempotencyKey: input.idempotencyKey ?? null,
        txHash: null,
        failureCode: null,
        requestedByUserId: input.requestedByUserId ?? null,
        requestedAt: now,
        submittedAt: null,
        validatedAt: null,
        details: input.details ?? null,
        createdAt: now,
        updatedAt: now,
      }
      cacheDistribution(record)
      return { policy, distribution: record }
    },
  )
}

export async function updateXrplIssuerDistribution(input: UpdateXrplIssuerDistributionInput) {
  const submittedAt = input.status === 'submitted' || input.status === 'validated' ? new Date() : undefined
  const validatedAt = input.status === 'validated' ? new Date() : undefined

  return withPgFallback(
    'xrpl-issuer-policy:distribution-update',
    async () => {
      const row = await prismaPg.xrplIssuerDistribution.update({
        where: {
          id: input.distributionId,
        },
        data: {
          status: input.status,
          ...(input.txHash !== undefined ? { txHash: input.txHash } : {}),
          ...(input.failureCode !== undefined ? { failureCode: input.failureCode } : {}),
          ...(input.details !== undefined ? { details: input.details ? toJson(input.details) : Prisma.JsonNull } : {}),
          ...(submittedAt ? { submittedAt } : {}),
          ...(validatedAt ? { validatedAt } : {}),
        },
      })

      if (row.holderId && (input.status === 'submitted' || input.status === 'validated')) {
        await prismaPg.xrplIssuerHolder.update({
          where: { id: row.holderId },
          data: {
            lastDistributionAt: validatedAt ?? submittedAt,
          },
        })
      }

      const record = rowToDistributionRecord(row)
      cacheDistribution(record)
      if (row.holderId && (input.status === 'submitted' || input.status === 'validated')) {
        const holderRow = await prismaPg.xrplIssuerHolder.findUnique({ where: { id: row.holderId } })
        if (holderRow) {
          cacheHolder(rowToHolderRecord(holderRow))
        }
      }
      return record
    },
    () => {
      const existing = memoryDistributions.get(input.distributionId)
      if (!existing) {
        throw new Error('Issuer distribution audit record was not found')
      }

      const now = nowIso()
      const record: XrplIssuerDistributionRecord = {
        ...existing,
        status: input.status,
        txHash: input.txHash !== undefined ? input.txHash : existing.txHash,
        failureCode: input.failureCode !== undefined ? input.failureCode : existing.failureCode,
        details: input.details !== undefined ? input.details : existing.details,
        submittedAt:
          input.status === 'submitted' || input.status === 'validated' ? now : existing.submittedAt,
        validatedAt: input.status === 'validated' ? now : existing.validatedAt,
        updatedAt: now,
      }
      cacheDistribution(record)

      if (existing.holderId && (input.status === 'submitted' || input.status === 'validated')) {
        const holder = memoryHolders.get(existing.holderId)
        if (holder) {
          cacheHolder({
            ...holder,
            lastDistributionAt: now,
            updatedAt: now,
          })
        }
      }

      return record
    },
  )
}

export function resetXrplIssuerPolicyState() {
  memoryPrograms.clear()
  memoryAssets.clear()
  memoryHolders.clear()
  memoryDistributions.clear()
}
