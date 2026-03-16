import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma-pg', () => ({
  prismaPg: {},
}))

describe('xrpl-issuer-policy.service', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.unstubAllEnvs()

    // These tests intentionally exercise the in-memory fallback. That keeps the
    // policy rules fast to test while still matching the real service contract.
    vi.stubEnv('PG_DATABASE_URL', '')
    vi.stubEnv('POSTGRES_URL', '')

    const { resetXrplIssuerPolicyState } = await import('@/services/xrpl-issuer-policy.service')
    resetXrplIssuerPolicyState()
  })

  // This covers the end-to-end state transitions the new models were added for:
  // register an asset, approve a holder, mark that holder authorized after the
  // on-ledger TrustSet, then audit a distribution against the same records.
  it('tracks issuer asset policy, holder authorization, and distribution audit state', async () => {
    const {
      createXrplIssuerDistribution,
      getXrplIssuerAssetPolicy,
      markXrplIssuerHolderAuthorized,
      reviewXrplIssuerHolder,
      updateXrplIssuerDistribution,
      upsertXrplIssuerAsset,
    } = await import('@/services/xrpl-issuer-policy.service')

    const registered = await upsertXrplIssuerAsset({
      networkId: 'testnet',
      issuerAccount: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
      currency: 'RWAUSD',
      displayName: 'RWA USD',
      maxDistributionValue: '1000',
      program: {
        requiresAuthorizedTrustlines: true,
        allowDistributions: true,
      },
      createdByUserId: 'user-1',
    })

    const approvedHolder = await reviewXrplIssuerHolder({
      networkId: 'testnet',
      issuerAccount: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
      currency: 'RWAUSD',
      holderAddress: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
      status: 'approved',
      approvedByUserId: 'user-1',
      notes: 'KYC complete',
    })

    expect(registered.program.requiresAuthorizedTrustlines).toBe(true)
    expect(approvedHolder.status).toBe('approved')
    expect(approvedHolder.approvedAt).not.toBeNull()

    const authorizedHolder = await markXrplIssuerHolderAuthorized({
      assetId: registered.asset.id,
      holderAddress: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
    })

    expect(authorizedHolder.status).toBe('authorized')
    expect(authorizedHolder.lastAuthorizedAt).not.toBeNull()

    const createdDistribution = await createXrplIssuerDistribution({
      networkId: 'testnet',
      issuerAccount: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
      currency: 'RWAUSD',
      destinationAddress: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
      amount: '250',
      actionId: 'action-1',
      idempotencyKey: '11111111-1111-4111-8111-111111111111',
      requestedByUserId: 'user-1',
    })

    expect(createdDistribution.distribution.status).toBe('queued')
    expect(createdDistribution.distribution.holderId).toBe(authorizedHolder.id)

    const validatedDistribution = await updateXrplIssuerDistribution({
      distributionId: createdDistribution.distribution.id,
      status: 'validated',
      txHash: 'ABC123',
    })

    expect(validatedDistribution.status).toBe('validated')
    expect(validatedDistribution.txHash).toBe('ABC123')
    expect(validatedDistribution.validatedAt).not.toBeNull()

    const reloadedPolicy = await getXrplIssuerAssetPolicy({
      networkId: 'testnet',
      issuerAccount: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
      currency: 'RWAUSD',
      holderAddress: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
    })

    expect(reloadedPolicy?.holder?.status).toBe('authorized')
    expect(reloadedPolicy?.holder?.lastDistributionAt).not.toBeNull()
  })

  // RequireAuth is the subtle rule that tends to get lost in app code. An
  // approved wallet is not yet distributable until the issuer has actually
  // authorized its trustline on-ledger.
  it('blocks distributions until an approved holder has been authorized', async () => {
    const {
      requireXrplIssuerHolderEligibility,
      reviewXrplIssuerHolder,
      upsertXrplIssuerAsset,
    } = await import('@/services/xrpl-issuer-policy.service')

    await upsertXrplIssuerAsset({
      networkId: 'testnet',
      issuerAccount: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
      currency: 'RWAUSD',
      program: {
        requiresAuthorizedTrustlines: true,
      },
    })

    await reviewXrplIssuerHolder({
      networkId: 'testnet',
      issuerAccount: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
      currency: 'RWAUSD',
      holderAddress: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
      status: 'approved',
      approvedByUserId: 'user-1',
    })

    await expect(
      requireXrplIssuerHolderEligibility({
        networkId: 'testnet',
        issuerAccount: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
        currency: 'RWAUSD',
        holderAddress: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
        action: 'distribute',
        amount: '10',
      }),
    ).rejects.toThrow('Holder trustline is not authorized for this asset')
  })

  // Asset-specific limits live off-ledger, so this test protects the exact kind
  // of policy that the XRPL transaction format will not enforce for us.
  it('enforces the configured maximum distribution value for an asset', async () => {
    const {
      requireXrplIssuerHolderEligibility,
      upsertXrplIssuerAsset,
    } = await import('@/services/xrpl-issuer-policy.service')

    await upsertXrplIssuerAsset({
      networkId: 'testnet',
      issuerAccount: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
      currency: 'RWAEUR',
      requireHolderApproval: false,
      maxDistributionValue: '100',
      program: {
        requiresAuthorizedTrustlines: false,
      },
    })

    await expect(
      requireXrplIssuerHolderEligibility({
        networkId: 'testnet',
        issuerAccount: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
        currency: 'RWAEUR',
        holderAddress: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
        action: 'distribute',
        amount: '100.01',
      }),
    ).rejects.toThrow('Distribution amount exceeds the configured asset limit')
  })
})
