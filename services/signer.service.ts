import { Wallet as EvmWallet } from 'ethers'
import { Wallet as XrplWallet } from 'xrpl'
import { createXrplWalletFromSeed } from '@/infra/xrpl/client'
import { decryptPrivateKey, encryptPrivateKey } from '@/lib/crypto/wallet-crypto'
import { deriveDeterministicWalletPqcMaterial } from '@/lib/pqc/deterministic'
import { resolveWalletPqcSubjectScheme } from '@/lib/pqc/provider'
import {
  buildHybridWalletSecurityProfile,
  encodeWalletToEncrypted,
  prepareWalletMaterial,
  type WalletSecurityProfile,
} from '@/lib/wallet'
import { getXrplSignerAccount, getXrplSignerWallet } from '@/lib/xrpl-signer'
import {
  assertEvmTransactionSigningAccount,
  assertXrplTransactionSigningAccount,
  buildAccountRef,
  type ResolvedSigningAccount,
  type SignRequest,
  type SignResult,
  type SignerAccountRef,
  type LiveTransactionCurve,
  type LiveTransactionScheme,
  type VaultScope,
  type WalletAccountPolicy,
  type XrplKeyType,
} from '@/lib/signing/types'
import { createWalletRecord, getWalletById, getWalletSigningAccount } from '@/services/wallet.service'

type SigningEvidence = {
  secondFactorVerified?: boolean
  pqAttestation?: {
    scheme: string
    signature: string
  }
}

export interface Signer {
  getPublicKey(accountRef: SignerAccountRef): Promise<string>
  sign(
    request: SignRequest,
    accountRef: SignerAccountRef,
    evidence?: SigningEvidence,
  ): Promise<SignResult>
  supports(curve: LiveTransactionCurve, scheme: LiveTransactionScheme): boolean
}

export type PrepareManagedWalletProvisioningInput = {
  password: string
  mnemonic?: string
  mnemonicPassphrase?: string
  vaultId?: VaultScope
  securityProfile?: WalletSecurityProfile
}

export type ManagedWalletProvisioningHandle = {
  encrypted: string
  address: string
  derivationPath: string
  wordCount: number
  persist: () => Promise<Awaited<ReturnType<typeof createWalletRecord>>>
}

export type PrepareManagedXrplWalletProvisioningInput = {
  seed: string
  keyType?: XrplKeyType
  networkId?: string | null
  vaultId?: VaultScope
  policy?: Partial<WalletAccountPolicy>
}

export type ManagedXrplWalletProvisioningHandle = {
  address: string
  publicKey: string
  keyType: XrplKeyType
  persist: () => Promise<Awaited<ReturnType<typeof createWalletRecord>>>
}

function assertPolicySatisfied(account: ResolvedSigningAccount, evidence?: SigningEvidence) {
  if (account.policy.requiresSecondFactor && !evidence?.secondFactorVerified) {
    throw new Error('SECOND_FACTOR_REQUIRED')
  }

  if (account.policy.requiresPQAttestation && !evidence?.pqAttestation) {
    throw new Error('PQ_ATTESTATION_REQUIRED')
  }
}

async function loadManagedSigningMaterial(accountRef: Extract<SignerAccountRef, { kind: 'managed' }>) {
  const account = await getWalletById(accountRef.walletId)
  if (!account) {
    throw new Error('WALLET_NOT_FOUND')
  }

  if (account.signerBackend !== 'local') {
    throw new Error('UNSUPPORTED_SIGNER_BACKEND')
  }

  if (!account.encryptedPrivateKey || !account.encryptionIv || account.keyVersion === null) {
    throw new Error('SIGNER_MATERIAL_UNAVAILABLE')
  }

  const signingMaterial = decryptPrivateKey(
    Buffer.from(account.encryptedPrivateKey),
    Buffer.from(account.encryptionIv),
    account.keyVersion,
    { address: account.address },
  )

  const resolved: ResolvedSigningAccount = {
    id: account.id,
    accountRef: account.accountRef,
    chain: account.chain,
    address: account.address,
    pubKey: account.pubKey,
    keyType: account.keyType,
    signerBackend: account.signerBackend,
    vaultId: account.vaultId,
    derivationPath: account.derivationPath,
    policy: account.policy,
    pqcBinding: account.pqcBinding,
    pqcBindingHash: account.pqcBindingHash,
    createdAt: account.createdAt,
  }

  return {
    account: resolved,
    signingMaterial: signingMaterial.trim(),
  }
}

function normalizeManagedEvmPrivateKey(value: string): string {
  return value.trim().startsWith('0x') ? value.trim() : `0x${value.trim()}`
}

function looksLikeXrplSeed(value: string): boolean {
  return /^s[1-9A-HJ-NP-Za-km-z]{15,}$/.test(value.trim())
}

export async function resolveSigningAccount(accountRef: SignerAccountRef): Promise<ResolvedSigningAccount> {
  if (accountRef.kind === 'xrpl-env') {
    return getXrplSignerAccount(accountRef.role)
  }

  const account = await getWalletSigningAccount(accountRef.walletId)
  if (!account) {
    throw new Error('WALLET_NOT_FOUND')
  }
  return account
}

export async function prepareManagedWalletProvisioning(
  input: PrepareManagedWalletProvisioningInput,
): Promise<ManagedWalletProvisioningHandle> {
  const prepared = prepareWalletMaterial({
    mnemonic: input.mnemonic,
    mnemonicPassphrase: input.mnemonicPassphrase,
  })

  const wallet = new EvmWallet(prepared.wallet.privateKey)
  const postQuantum = await deriveDeterministicWalletPqcMaterial({
    mnemonic: prepared.mnemonic,
    mnemonicPassphrase: input.mnemonicPassphrase,
    vaultId: input.vaultId ?? 'public',
    chain: 'ETH',
    derivationPath: prepared.derivationPath,
    subject: {
      accountRef: buildAccountRef({
        chain: 'EVM',
        keyType: 'secp256k1',
        pubKey: wallet.signingKey.publicKey,
        address: prepared.wallet.address,
      }),
      chain: 'EVM',
      address: prepared.wallet.address,
      keyType: 'secp256k1',
      scheme: resolveWalletPqcSubjectScheme('secp256k1'),
      publicKey: wallet.signingKey.publicKey,
      publicKeyFormat: 'hex',
    },
  })
  const securityProfile = buildHybridWalletSecurityProfile('secp256k1', input.securityProfile)
  const encrypted = await encodeWalletToEncrypted(prepared.wallet, input.password, {
    securityProfile,
    postQuantum,
  })
  const encryptedSignerMaterial = encryptPrivateKey(prepared.wallet.privateKey, {
    address: prepared.wallet.address,
  })

  return {
    encrypted,
    address: prepared.wallet.address,
    derivationPath: prepared.derivationPath,
    wordCount: prepared.wordCount,
    persist: () =>
      createWalletRecord({
        address: prepared.wallet.address,
        pubKey: wallet.signingKey.publicKey,
        keyType: 'secp256k1',
        signerBackend: 'local',
        vaultId: input.vaultId ?? 'public',
        derivationPath: prepared.derivationPath,
        pqcBinding: postQuantum.binding,
        encryptedPrivateKey: encryptedSignerMaterial.encryptedPrivateKey,
        encryptionIv: encryptedSignerMaterial.encryptionIv,
        keyVersion: encryptedSignerMaterial.keyVersion,
      }),
  }
}

export async function prepareManagedXrplWalletProvisioning(
  input: PrepareManagedXrplWalletProvisioningInput,
): Promise<ManagedXrplWalletProvisioningHandle> {
  const seed = input.seed.trim()
  if (!seed) {
    throw new Error('XRPL seed is required')
  }

  const keyType = input.keyType ?? 'ed25519'
  const wallet = createXrplWalletFromSeed(seed, keyType)
  const encryptedSignerMaterial = encryptPrivateKey(seed, {
    address: wallet.classicAddress,
  })

  return {
    address: wallet.classicAddress,
    publicKey: wallet.publicKey,
    keyType,
    persist: () =>
      createWalletRecord({
        address: wallet.classicAddress,
        chain: 'XRPL',
        networkId: input.networkId ?? null,
        pubKey: wallet.publicKey,
        keyType,
        signerBackend: 'local',
        vaultId: input.vaultId ?? 'vault',
        policy: input.policy,
        encryptedPrivateKey: encryptedSignerMaterial.encryptedPrivateKey,
        encryptionIv: encryptedSignerMaterial.encryptionIv,
        keyVersion: encryptedSignerMaterial.keyVersion,
      }),
  }
}

class LocalSigner implements Signer {
  supports(curve: LiveTransactionCurve, scheme: LiveTransactionScheme): boolean {
    if (curve === 'secp256k1' && scheme === 'ecdsa') return true
    if (curve === 'ed25519' && scheme === 'eddsa') return true
    return false
  }

  async getPublicKey(accountRef: SignerAccountRef): Promise<string> {
    if (accountRef.kind === 'xrpl-env') {
      return getXrplSignerAccount(accountRef.role).pubKey ?? ''
    }

    const { account, signingMaterial } = await loadManagedSigningMaterial(accountRef)
    if (account.pubKey) return account.pubKey
    return new EvmWallet(normalizeManagedEvmPrivateKey(signingMaterial)).signingKey.publicKey
  }

  async sign(
    request: SignRequest,
    accountRef: SignerAccountRef,
    evidence?: SigningEvidence,
  ): Promise<SignResult> {
    // Guardrail: live chain execution is classical-only. PQ material is limited to
    // off-chain binding/attestation and on-chain commitment hashes in this repo.
    if (accountRef.kind === 'xrpl-env') {
      const account = assertXrplTransactionSigningAccount(getXrplSignerAccount(accountRef.role))
      assertPolicySatisfied(account, evidence)

      if (request.kind !== 'xrpl-transaction') {
        throw new Error('SIGNER_CHAIN_MISMATCH')
      }

      const signed = getXrplSignerWallet(accountRef.role).sign(
        request.preparedTransaction as Parameters<ReturnType<typeof getXrplSignerWallet>['sign']>[0],
      )
      return {
        kind: 'xrpl-transaction',
        txBlob: signed.tx_blob,
        txHash: signed.hash,
        publicKey: account.pubKey ?? '',
      }
    }

    const { account, signingMaterial } = await loadManagedSigningMaterial(accountRef)
    assertPolicySatisfied(account, evidence)

    if (request.kind === 'evm-transaction') {
      const evmAccount = assertEvmTransactionSigningAccount(account)

      const wallet = new EvmWallet(normalizeManagedEvmPrivateKey(signingMaterial))
      const signedPayload = await wallet.signTransaction({
        ...request.transaction,
        chainId: request.chainId,
      })
      return {
        kind: 'evm-transaction',
        signedPayload,
        publicKey: evmAccount.pubKey ?? wallet.signingKey.publicKey,
      }
    }

    const xrplAccount = assertXrplTransactionSigningAccount(account)

    const wallet = looksLikeXrplSeed(signingMaterial)
      ? createXrplWalletFromSeed(signingMaterial, xrplAccount.keyType)
      : new XrplWallet(xrplAccount.pubKey, normalizeManagedEvmPrivateKey(signingMaterial), {
          masterAddress: xrplAccount.address,
        })
    const signed = wallet.sign(
      request.preparedTransaction as Parameters<typeof wallet.sign>[0],
    )
    return {
      kind: 'xrpl-transaction',
      txBlob: signed.tx_blob,
      txHash: signed.hash,
      publicKey: xrplAccount.pubKey,
    }
  }
}

const signer = new LocalSigner()

export function getSigner(): Signer {
  return signer
}
