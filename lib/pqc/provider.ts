import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'
import type {
  WalletPqcBinding,
  WalletPqcBoundKeyType,
  WalletPqcBoundScheme,
  WalletPqcBoundSubject,
  WalletPqcDerivation,
  WalletPqcEncryptedMaterial,
  WalletPqcKeyPair,
  WalletPqcProviderBackend,
} from '@/lib/pqc/types'

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64')
  }

  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(value, 'base64'))
  }

  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function encodeUtf8(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

export function encodeRawWalletPqcKeyPair(input: {
  publicKey: Uint8Array
  privateKey: Uint8Array
}): WalletPqcKeyPair {
  return {
    scheme: 'ml-dsa-65',
    provider: 'noble',
    publicKey: bytesToBase64(input.publicKey),
    publicKeyFormat: 'raw-base64',
    privateKey: bytesToBase64(input.privateKey),
    privateKeyFormat: 'raw-base64',
  }
}

export function resolveWalletPqcSubjectScheme(keyType: WalletPqcBoundKeyType): WalletPqcBoundScheme {
  return keyType === 'ed25519' ? 'eddsa' : 'ecdsa'
}

export function buildWalletPqcBindingStatement(
  subject: WalletPqcBoundSubject,
  attestedAt: string,
): string {
  return JSON.stringify({
    version: 1,
    type: 'classical-key-binding',
    role: 'vault-identity',
    scheme: 'ml-dsa-65',
    attestedAt,
    subject: {
      accountRef: subject.accountRef,
      chain: subject.chain,
      address: subject.address,
      keyType: subject.keyType,
      signingScheme: subject.scheme,
      publicKey: subject.publicKey,
      publicKeyFormat: subject.publicKeyFormat,
    },
  })
}

export interface WalletPqcProvider {
  readonly backend: WalletPqcProviderBackend
  generateKeyPair(): Promise<WalletPqcKeyPair>
  supportsBinding(binding: WalletPqcBinding): boolean
  createBinding(
    subject: WalletPqcBoundSubject,
    keyPair: WalletPqcKeyPair,
    attestedAt?: string,
  ): Promise<WalletPqcBinding>
  verifyBinding(binding: WalletPqcBinding): Promise<boolean>
}

class NobleWalletPqcProvider implements WalletPqcProvider {
  readonly backend: WalletPqcProviderBackend = 'noble'

  async generateKeyPair(): Promise<WalletPqcKeyPair> {
    const keys = ml_dsa65.keygen()
    return encodeRawWalletPqcKeyPair({
      publicKey: keys.publicKey,
      privateKey: keys.secretKey,
    })
  }

  supportsBinding(binding: WalletPqcBinding): boolean {
    return binding.publicKeyFormat === 'raw-base64'
  }

  async createBinding(
    subject: WalletPqcBoundSubject,
    keyPair: WalletPqcKeyPair,
    attestedAt = new Date().toISOString(),
  ): Promise<WalletPqcBinding> {
    if (keyPair.privateKeyFormat !== 'raw-base64' || keyPair.publicKeyFormat !== 'raw-base64') {
      throw new Error('Unsupported ML-DSA key format for noble provider')
    }

    const statement = buildWalletPqcBindingStatement(subject, attestedAt)
    const signature = ml_dsa65.sign(encodeUtf8(statement), base64ToBytes(keyPair.privateKey))

    return {
      version: 1,
      role: 'vault-identity',
      scheme: 'ml-dsa-65',
      provider: this.backend,
      publicKey: keyPair.publicKey,
      publicKeyFormat: keyPair.publicKeyFormat,
      subject,
      challenge: {
        type: 'classical-key-binding',
        statement,
        statementFormat: 'utf8-json',
      },
      proof: {
        signature: bytesToBase64(signature),
        signatureFormat: 'raw-base64',
        attestedAt,
      },
    }
  }

  async verifyBinding(binding: WalletPqcBinding): Promise<boolean> {
    if (!this.supportsBinding(binding)) {
      return false
    }

    return ml_dsa65.verify(
      base64ToBytes(binding.proof.signature),
      encodeUtf8(binding.challenge.statement),
      base64ToBytes(binding.publicKey),
    )
  }
}

const defaultWalletPqcProvider = new NobleWalletPqcProvider()

export function getDefaultWalletPqcProvider(): WalletPqcProvider {
  return defaultWalletPqcProvider
}

export function generateDeterministicKeyPair(seed: Uint8Array): WalletPqcKeyPair {
  const expectedSeedLength = ml_dsa65.lengths.seed ?? 32
  if (seed.length !== expectedSeedLength) {
    throw new Error(`ML-DSA-65 seed must be ${expectedSeedLength} bytes`)
  }

  const keys = ml_dsa65.keygen(new Uint8Array(seed))
  return encodeRawWalletPqcKeyPair({
    publicKey: keys.publicKey,
    privateKey: keys.secretKey,
  })
}

export async function createWalletPqcEncryptedMaterialFromKeyPair(input: {
  subject: WalletPqcBoundSubject
  keyPair: WalletPqcKeyPair
  provider?: WalletPqcProvider
  attestedAt?: string
  derivation?: WalletPqcDerivation
}): Promise<WalletPqcEncryptedMaterial> {
  const provider = input.provider ?? getDefaultWalletPqcProvider()
  const binding = await provider.createBinding(input.subject, input.keyPair, input.attestedAt)

  return {
    keyPair: input.keyPair,
    binding: input.derivation ? { ...binding, derivation: input.derivation } : binding,
    ...(input.derivation ? { derivation: input.derivation } : {}),
  }
}

export async function createWalletPqcEncryptedMaterial(input: {
  subject: WalletPqcBoundSubject
  provider?: WalletPqcProvider
  attestedAt?: string
}): Promise<WalletPqcEncryptedMaterial> {
  const provider = input.provider ?? getDefaultWalletPqcProvider()
  const keyPair = await provider.generateKeyPair()
  return createWalletPqcEncryptedMaterialFromKeyPair({
    keyPair,
    subject: input.subject,
    provider,
    attestedAt: input.attestedAt,
  })
}

export async function createDeterministicWalletPqcEncryptedMaterial(input: {
  seed: Uint8Array
  subject: WalletPqcBoundSubject
  attestedAt?: string
  derivation: WalletPqcDerivation
}): Promise<WalletPqcEncryptedMaterial> {
  const keyPair = generateDeterministicKeyPair(input.seed)

  return createWalletPqcEncryptedMaterialFromKeyPair({
    keyPair,
    subject: input.subject,
    attestedAt: input.attestedAt,
    derivation: input.derivation,
  })
}

export async function verifyWalletPqcBinding(
  binding: WalletPqcBinding,
  provider: WalletPqcProvider = getDefaultWalletPqcProvider(),
): Promise<boolean> {
  return provider.verifyBinding(binding)
}
