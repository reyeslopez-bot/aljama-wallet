import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as signMessage,
  verify as verifyMessage,
} from 'node:crypto'
import {
  buildWalletPqcBindingStatement,
  getDefaultWalletPqcProvider,
  type WalletPqcProvider,
} from '@/lib/pqc/provider'
import type {
  WalletPqcBinding,
  WalletPqcBoundSubject,
  WalletPqcKeyPair,
  WalletPqcProviderBackend,
} from '@/lib/pqc/types'

function bytesToBase64(bytes: Uint8Array | Buffer): string {
  return Buffer.from(bytes).toString('base64')
}

function base64ToBuffer(value: string): Buffer {
  return Buffer.from(value, 'base64')
}

class NativeWalletPqcProvider implements WalletPqcProvider {
  readonly backend: WalletPqcProviderBackend = 'node-native'

  async generateKeyPair(): Promise<WalletPqcKeyPair> {
    const keys = generateKeyPairSync('ml-dsa-65', {
      publicKeyEncoding: { format: 'der', type: 'spki' },
      privateKeyEncoding: { format: 'der', type: 'pkcs8' },
    })

    return {
      scheme: 'ml-dsa-65',
      provider: this.backend,
      publicKey: bytesToBase64(keys.publicKey),
      publicKeyFormat: 'spki-der-base64',
      privateKey: bytesToBase64(keys.privateKey),
      privateKeyFormat: 'pkcs8-der-base64',
    }
  }

  supportsBinding(binding: WalletPqcBinding): boolean {
    return binding.publicKeyFormat === 'spki-der-base64'
  }

  async createBinding(
    subject: WalletPqcBoundSubject,
    keyPair: WalletPqcKeyPair,
    attestedAt = new Date().toISOString(),
  ): Promise<WalletPqcBinding> {
    if (keyPair.privateKeyFormat !== 'pkcs8-der-base64' || keyPair.publicKeyFormat !== 'spki-der-base64') {
      throw new Error('Unsupported ML-DSA key format for native provider')
    }

    const statement = buildWalletPqcBindingStatement(subject, attestedAt)
    const signature = signMessage(
      null,
      Buffer.from(statement, 'utf8'),
      createPrivateKey({
        key: base64ToBuffer(keyPair.privateKey),
        format: 'der',
        type: 'pkcs8',
      }),
    )

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

    return verifyMessage(
      null,
      Buffer.from(binding.challenge.statement, 'utf8'),
      createPublicKey({
        key: base64ToBuffer(binding.publicKey),
        format: 'der',
        type: 'spki',
      }),
      base64ToBuffer(binding.proof.signature),
    )
  }
}

const nativeWalletPqcProvider = new NativeWalletPqcProvider()

export function getServerWalletPqcProvider(): WalletPqcProvider {
  const backend = (process.env.WALLET_PQC_BACKEND ?? 'noble').trim().toLowerCase()
  return backend === 'native' ? nativeWalletPqcProvider : getDefaultWalletPqcProvider()
}
