import { ed25519 } from '@noble/curves/ed25519'
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'
import { base58, bech32 } from '@scure/base'
import {
  HDNodeWallet,
  Mnemonic,
  computeAddress,
  computeHmac,
  getBytes,
  hexlify,
  ripemd160,
  sha256,
} from 'ethers'
import { encodeAccountID } from 'ripple-address-codec'
import type {
  WalletPqcDerivation,
  WalletPqcDerivationChain,
  WalletPqcDerivationCurve,
} from '@/lib/pqc/types'

export type Curve = 'secp256k1' | 'ed25519'
export type Chain = 'BTC' | 'ETH' | 'XRPL_SECP' | 'XRPL_ED'
export type VaultId = 'public' | 'vault'

export type DerivationPurpose = 44 | 49 | 84

export type PathSpec = {
  curve: Curve
  pathTemplate: (account: number, change: 0 | 1, index: number) => string
  usesChange: boolean
}

export type ChainRegistryEntry = {
  chain: Chain
  coinType: number
  curve: Curve
  defaultPurpose: DerivationPurpose
  path: PathSpec
  addressFromPublicKey: (publicKeyBytes: Uint8Array, path: string) => string
  signTx: (privateKeyBytes: Uint8Array, txBytes: Uint8Array) => Uint8Array
}

export type DerivedKey = {
  chain: Chain
  curve: Curve
  path: string
  account: number
  change: 0 | 1
  index: number
  publicKey: Uint8Array
  privateKey?: Uint8Array
  address: string
}

export type VaultConfig = {
  id: VaultId
  mnemonic: string
}

export type KeyRequest = {
  chain: Chain
  account: number
  change?: 0 | 1
  index: number
}

export type CounterState = {
  nextIndexByChainAccount: Record<string, number>
}

export type PqcKeyRequest = {
  chain: WalletPqcDerivationChain
  account: number
  change?: 0 | 1
  index: number
}

export type DerivedPqcKey = {
  scheme: 'ml-dsa-65'
  chain: WalletPqcDerivationChain
  curve: WalletPqcDerivationCurve
  path: string
  account: number
  change: 0 | 1
  index: number
  publicKey: Uint8Array
  privateKey: Uint8Array
  derivation: WalletPqcDerivation
}

type Slip10Node = {
  key: Uint8Array
  chainCode: Uint8Array
}

type PathSegment = {
  index: number
  hardened: boolean
}

const HARDENED_OFFSET = 0x80000000
const UINT31_MAX = 0x7fffffff
const PQC_DERIVATION_DOMAIN = 'aljama-wallet:pqc:ml-dsa-65:v1'
const PQC_MASTER_SALT = `${PQC_DERIVATION_DOMAIN}:master`
const PQC_DERIVE_SALT = `${PQC_DERIVATION_DOMAIN}:derive`

function bytesFromHex(hex: string): Uint8Array {
  return new Uint8Array(getBytes(hex))
}

function bytesToHex(bytes: Uint8Array): string {
  return hexlify(bytes)
}

function hexNoPrefixUpper(bytes: Uint8Array): string {
  return bytesToHex(bytes).slice(2).toUpperCase()
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

function uint32ToBigEndian(value: number): Uint8Array {
  return new Uint8Array([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ])
}

function utf8Bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

function hash160(data: Uint8Array): Uint8Array {
  return bytesFromHex(ripemd160(sha256(data)))
}

function base58Check(versionByte: number, payload: Uint8Array): string {
  const versioned = concatBytes(new Uint8Array([versionByte]), payload)
  const checksum = bytesFromHex(sha256(bytesFromHex(sha256(versioned)))).slice(0, 4)
  return base58.encode(concatBytes(versioned, checksum))
}

function parseDerivationPath(path: string): PathSegment[] {
  const normalized = path.trim()
  if (!normalized) {
    throw new Error('Derivation path is required')
  }
  if (normalized === 'm') return []

  const segments = normalized.split('/')
  if (segments[0] !== 'm') {
    throw new Error(`Invalid derivation path root: ${path}`)
  }

  return segments.slice(1).map((segment) => {
    const match = segment.match(/^(\d+)(['hH])?$/)
    if (!match) {
      throw new Error(`Invalid derivation path segment: ${segment}`)
    }
    const index = Number.parseInt(match[1] ?? '', 10)
    if (!Number.isInteger(index) || index < 0 || index > UINT31_MAX) {
      throw new Error(`Invalid derivation index: ${segment}`)
    }
    const hardenedMark = match[2]
    return { index, hardened: hardenedMark === "'" || hardenedMark === 'h' || hardenedMark === 'H' }
  })
}

function assertEd25519Path(path: string): void {
  const segments = parseDerivationPath(path)
  if (segments.some((segment) => !segment.hardened)) {
    throw new Error(`ed25519 paths must be hardened: ${path}`)
  }
}

function pathToBip44Shape(path: string): { account: number; change: 0 | 1; index: number } | null {
  const segments = parseDerivationPath(path)
  if (segments.length < 5) return null
  const accountSegment = segments[2]
  const changeSegment = segments[3]
  const indexSegment = segments[4]
  if (!accountSegment || !changeSegment || !indexSegment) return null
  if (changeSegment.index !== 0 && changeSegment.index !== 1) return null
  return {
    account: accountSegment.index,
    change: changeSegment.index as 0 | 1,
    index: indexSegment.index,
  }
}

function hmacSha512(key: Uint8Array, data: Uint8Array): Uint8Array {
  return new Uint8Array(bytesFromHex(computeHmac('sha512', key, data)))
}

function hkdfSha512(
  ikm: Uint8Array,
  saltText: string,
  infoText: string,
  length: number,
): Uint8Array {
  const prk = hmacSha512(utf8Bytes(saltText), ikm)
  const info = utf8Bytes(infoText)
  const blocks: Uint8Array[] = []
  let previous: Uint8Array<ArrayBufferLike> = new Uint8Array()

  while (blocks.reduce((total, block) => total + block.length, 0) < length) {
    const next = hmacSha512(prk, concatBytes(previous, info, new Uint8Array([blocks.length + 1])))
    blocks.push(next)
    previous = next
  }

  const combined = concatBytes(...blocks)
  return new Uint8Array(combined.slice(0, length))
}

function isPqcCapableChain(chain: Chain): chain is WalletPqcDerivationChain {
  return chain === 'ETH' || chain === 'XRPL_SECP' || chain === 'XRPL_ED'
}

function slip10FromSeedEd25519(seed: Uint8Array): Slip10Node {
  const i = hmacSha512(new TextEncoder().encode('ed25519 seed'), seed)
  return {
    key: i.slice(0, 32),
    chainCode: i.slice(32),
  }
}

function deriveSlip10Ed25519Path(seed: Uint8Array, path: string): Slip10Node {
  assertEd25519Path(path)
  const segments = parseDerivationPath(path)
  let node = slip10FromSeedEd25519(seed)
  for (const segment of segments) {
    const index = segment.index + HARDENED_OFFSET
    const data = concatBytes(new Uint8Array([0x00]), node.key, uint32ToBigEndian(index))
    const i = hmacSha512(node.chainCode, data)
    node = {
      key: i.slice(0, 32),
      chainCode: i.slice(32),
    }
  }
  return node
}

function bip39SeedFromMnemonic(mnemonic: string, passphrase: string): Uint8Array {
  const phrase = mnemonic.trim()
  if (!phrase) {
    throw new Error('Mnemonic is required')
  }
  const seed = Mnemonic.fromPhrase(phrase, passphrase).computeSeed()
  return new Uint8Array(getBytes(seed))
}

function secpRootFromSeed(seed: Uint8Array): HDNodeWallet {
  return HDNodeWallet.fromSeed(seed)
}

function evmAddressFromPubKey(pubKeyBytes: Uint8Array): string {
  return computeAddress(bytesToHex(pubKeyBytes))
}

function xrplAddressFromPubKey(pubKeyBytes: Uint8Array, curve: Curve): string {
  const keyHex = hexNoPrefixUpper(pubKeyBytes)
  const encoded = curve === 'ed25519' ? `ED${keyHex}` : keyHex
  const accountId = hash160(bytesFromHex(`0x${encoded}`))
  return encodeAccountID(accountId)
}

function btcAddressFromPubKey(pubKeyBytes: Uint8Array, purpose: DerivationPurpose): string {
  const keyHash = hash160(pubKeyBytes)
  if (purpose === 44) {
    return base58Check(0x00, keyHash)
  }

  if (purpose === 49) {
    const redeemScript = concatBytes(new Uint8Array([0x00, 0x14]), keyHash)
    return base58Check(0x05, hash160(redeemScript))
  }

  const words = bech32.toWords(keyHash)
  return bech32.encode('bc', [0, ...words])
}

function purposeFromPath(path: string): DerivationPurpose {
  const segments = parseDerivationPath(path)
  const maybePurpose = segments[0]?.index
  if (maybePurpose === 44 || maybePurpose === 49 || maybePurpose === 84) {
    return maybePurpose
  }
  return 84
}

export const REGISTRY: Record<Chain, ChainRegistryEntry> = {
  BTC: {
    chain: 'BTC',
    coinType: 0,
    curve: 'secp256k1',
    defaultPurpose: 84,
    path: {
      curve: 'secp256k1',
      usesChange: true,
      pathTemplate: (account, change, index) => `m/84'/0'/${account}'/${change}/${index}`,
    },
    addressFromPublicKey: (publicKey, path) => btcAddressFromPubKey(publicKey, purposeFromPath(path)),
    signTx: () => {
      throw new Error('BTC signing not implemented')
    },
  },
  ETH: {
    chain: 'ETH',
    coinType: 60,
    curve: 'secp256k1',
    defaultPurpose: 44,
    path: {
      curve: 'secp256k1',
      usesChange: true,
      pathTemplate: (account, _change, index) => `m/44'/60'/${account}'/0/${index}`,
    },
    addressFromPublicKey: (publicKey) => evmAddressFromPubKey(publicKey),
    signTx: () => {
      throw new Error('EVM signing not implemented')
    },
  },
  XRPL_SECP: {
    chain: 'XRPL_SECP',
    coinType: 144,
    curve: 'secp256k1',
    defaultPurpose: 44,
    path: {
      curve: 'secp256k1',
      usesChange: false,
      pathTemplate: (account, _change, index) => `m/44'/144'/${account}'/0/${index}`,
    },
    addressFromPublicKey: (publicKey) => xrplAddressFromPubKey(publicKey, 'secp256k1'),
    signTx: () => {
      throw new Error('XRPL secp256k1 signing not implemented')
    },
  },
  XRPL_ED: {
    chain: 'XRPL_ED',
    coinType: 144,
    curve: 'ed25519',
    defaultPurpose: 44,
    path: {
      curve: 'ed25519',
      usesChange: false,
      pathTemplate: (account, _change, index) => `m/44'/144'/${account}'/0'/${index}'`,
    },
    addressFromPublicKey: (publicKey) => xrplAddressFromPubKey(publicKey, 'ed25519'),
    signTx: () => {
      throw new Error('XRPL ed25519 signing not implemented')
    },
  },
}

function counterKey(chain: Chain, account: number, change: 0 | 1): string {
  return `${chain}:${account}:${change}`
}

function cloneBytes(input?: Uint8Array): Uint8Array | undefined {
  return input ? new Uint8Array(input) : undefined
}

function wipeBytes(input?: Uint8Array): void {
  input?.fill(0)
}

export class DeterministicVault {
  readonly id: VaultId
  readonly mnemonic: string

  private seed?: Uint8Array
  private secpRoot?: HDNodeWallet
  private edSeed?: Uint8Array
  private pqcMasterSecret?: Uint8Array
  private counters: CounterState

  constructor(cfg: VaultConfig, options?: { passphrase?: string; deferUnlock?: boolean; counters?: CounterState }) {
    this.id = cfg.id
    this.mnemonic = cfg.mnemonic.trim()
    if (!this.mnemonic) {
      throw new Error('Mnemonic is required')
    }
    this.counters = options?.counters
      ? { nextIndexByChainAccount: { ...options.counters.nextIndexByChainAccount } }
      : { nextIndexByChainAccount: {} }

    if (!options?.deferUnlock) {
      this.unlock(options?.passphrase ?? '')
    }
  }

  unlock(passphrase: string): void {
    this.lock()
    this.seed = bip39SeedFromMnemonic(this.mnemonic, passphrase)
    this.secpRoot = secpRootFromSeed(this.seed)
    this.edSeed = cloneBytes(this.seed)
    this.pqcMasterSecret = hkdfSha512(this.seed, PQC_MASTER_SALT, `vault=${this.id}`, 64)
  }

  lock(): void {
    wipeBytes(this.seed)
    wipeBytes(this.edSeed)
    wipeBytes(this.pqcMasterSecret)
    this.seed = undefined
    this.edSeed = undefined
    this.pqcMasterSecret = undefined
    this.secpRoot = undefined
  }

  isUnlocked(): boolean {
    return Boolean(this.seed && this.secpRoot && this.edSeed && this.pqcMasterSecret)
  }

  exportCounterState(): CounterState {
    return { nextIndexByChainAccount: { ...this.counters.nextIndexByChainAccount } }
  }

  replaceCounterState(next: CounterState): void {
    this.counters = { nextIndexByChainAccount: { ...next.nextIndexByChainAccount } }
  }

  allocateIndex(chain: Chain, account: number, change: 0 | 1): number {
    const key = counterKey(chain, account, change)
    const current = this.counters.nextIndexByChainAccount[key] ?? 0
    this.counters.nextIndexByChainAccount[key] = current + 1
    return current
  }

  derive(req: KeyRequest): DerivedKey {
    const entry = REGISTRY[req.chain]
    const change: 0 | 1 = entry.path.usesChange ? (req.change ?? 0) : 0
    const path = entry.path.pathTemplate(req.account, change, req.index)
    return this.deriveAtPath(req.chain, path, {
      account: req.account,
      change,
      index: req.index,
    })
  }

  private derivePostQuantumSeedAtPath(
    chain: WalletPqcDerivationChain,
    path: string,
    hints?: { account?: number; change?: 0 | 1; index?: number },
  ): { seed: Uint8Array; derivation: WalletPqcDerivation } {
    if (!this.pqcMasterSecret) {
      throw new Error('Vault is locked (post-quantum root missing)')
    }

    const entry = REGISTRY[chain]
    const shape = pathToBip44Shape(path)
    const account = hints?.account ?? shape?.account ?? 0
    const change = hints?.change ?? shape?.change ?? 0
    const index = hints?.index ?? shape?.index ?? 0
    const info =
      `vault=${this.id}` +
      `\0chain=${chain}` +
      `\0curve=${entry.curve}` +
      `\0account=${account}` +
      `\0change=${change}` +
      `\0index=${index}` +
      `\0path=${path}`

    return {
      seed: hkdfSha512(this.pqcMasterSecret, PQC_DERIVE_SALT, info, ml_dsa65.lengths.seed ?? 32),
      derivation: {
        mode: 'deterministic-bip39-hkdf-sha512-v1',
        vaultId: this.id,
        chain,
        curve: entry.curve,
        account,
        change,
        index,
        path,
        kdf: 'hkdf-sha512',
        domain: PQC_DERIVATION_DOMAIN,
      },
    }
  }

  derivePostQuantum(req: PqcKeyRequest): DerivedPqcKey {
    const entry = REGISTRY[req.chain]
    const change: 0 | 1 = entry.path.usesChange ? (req.change ?? 0) : 0
    const path = entry.path.pathTemplate(req.account, change, req.index)

    return this.derivePostQuantumAtPath(req.chain, path, {
      account: req.account,
      change,
      index: req.index,
    })
  }

  derivePostQuantumAtPath(
    chain: WalletPqcDerivationChain,
    path: string,
    hints?: { account?: number; change?: 0 | 1; index?: number },
  ): DerivedPqcKey {
    if (!isPqcCapableChain(chain)) {
      throw new Error(`Post-quantum derivation is not supported for chain: ${chain}`)
    }

    const { seed, derivation } = this.derivePostQuantumSeedAtPath(chain, path, hints)
    const keys = ml_dsa65.keygen(seed)

    return {
      scheme: 'ml-dsa-65',
      chain,
      curve: derivation.curve,
      path,
      account: derivation.account,
      change: derivation.change,
      index: derivation.index,
      publicKey: new Uint8Array(keys.publicKey),
      privateKey: new Uint8Array(keys.secretKey),
      derivation,
    }
  }

  deriveAtPath(
    chain: Chain,
    path: string,
    hints?: { account?: number; change?: 0 | 1; index?: number },
  ): DerivedKey {
    const entry = REGISTRY[chain]
    const shape = pathToBip44Shape(path)
    const account = hints?.account ?? shape?.account ?? 0
    const change = hints?.change ?? shape?.change ?? 0
    const index = hints?.index ?? shape?.index ?? 0

    if (entry.curve === 'ed25519') {
      if (!this.edSeed) throw new Error('Vault is locked (ed25519 root missing)')
      const node = deriveSlip10Ed25519Path(this.edSeed, path)
      const publicKey = ed25519.getPublicKey(node.key)
      const address = entry.addressFromPublicKey(publicKey, path)
      return {
        chain,
        curve: entry.curve,
        path,
        account,
        change,
        index,
        publicKey,
        privateKey: cloneBytes(node.key),
        address,
      }
    }

    if (!this.secpRoot) throw new Error('Vault is locked (secp256k1 root missing)')
    const node = this.secpRoot.derivePath(path)
    if (!node.privateKey) throw new Error(`Unable to derive private key at path: ${path}`)
    const privateKey = bytesFromHex(node.privateKey)
    const publicKey = bytesFromHex(node.publicKey)
    const address = entry.addressFromPublicKey(publicKey, path)
    return {
      chain,
      curve: entry.curve,
      path,
      account,
      change,
      index,
      publicKey,
      privateKey,
      address,
    }
  }

  nextReceiveAddress(chain: Chain, account = 0): DerivedKey {
    const entry = REGISTRY[chain]
    const change: 0 | 1 = entry.path.usesChange ? 0 : 0
    const index = this.allocateIndex(chain, account, change)
    return this.derive({ chain, account, change, index })
  }
}

export class UserDeterministicWallet {
  readonly publicVault: DeterministicVault
  readonly privateVault: DeterministicVault

  constructor(mnemonic: string) {
    this.publicVault = new DeterministicVault({ id: 'public', mnemonic }, { passphrase: '' })
    this.privateVault = new DeterministicVault({ id: 'vault', mnemonic }, { deferUnlock: true })
  }

  unlockPrivateVault(passphrase: string): void {
    this.privateVault.unlock(passphrase)
  }

  lockPrivateVault(): void {
    this.privateVault.lock()
  }
}

export type PathCandidate = {
  chain: Chain
  curve: Curve
  purpose?: DerivationPurpose
  template: (account: number, index: number) => string
}

export const COMPAT_PATHS: PathCandidate[] = [
  {
    chain: 'BTC',
    curve: 'secp256k1',
    purpose: 44,
    template: (account, index) => `m/44'/0'/${account}'/0/${index}`,
  },
  {
    chain: 'BTC',
    curve: 'secp256k1',
    purpose: 49,
    template: (account, index) => `m/49'/0'/${account}'/0/${index}`,
  },
  {
    chain: 'BTC',
    curve: 'secp256k1',
    purpose: 84,
    template: (account, index) => `m/84'/0'/${account}'/0/${index}`,
  },
  {
    chain: 'ETH',
    curve: 'secp256k1',
    template: (account, index) => `m/44'/60'/${account}'/0/${index}`,
  },
  {
    chain: 'XRPL_ED',
    curve: 'ed25519',
    template: (account, index) => `m/44'/144'/${account}'/0'/${index}'`,
  },
  {
    chain: 'XRPL_SECP',
    curve: 'secp256k1',
    template: (account, index) => `m/44'/144'/${account}'/0/${index}`,
  },
]

export async function discoverAccountsAndAddresses(opts: {
  vault: DeterministicVault
  chains: Chain[]
  maxAccounts: number
  maxAddrsPerAccount: number
  getBalance: (chain: Chain, address: string) => Promise<bigint>
}): Promise<
  Array<{ chain: Chain; account: number; discovered: Array<{ path: string; address: string; balance: bigint }> }>
> {
  const results: Array<{
    chain: Chain
    account: number
    discovered: Array<{ path: string; address: string; balance: bigint }>
  }> = []

  for (const chain of opts.chains) {
    const candidates = COMPAT_PATHS.filter((candidate) => candidate.chain === chain)
    for (let account = 0; account < opts.maxAccounts; account += 1) {
      const discovered: Array<{ path: string; address: string; balance: bigint }> = []

      for (const candidate of candidates) {
        for (let index = 0; index < opts.maxAddrsPerAccount; index += 1) {
          const path = candidate.template(account, index)
          let key: DerivedKey
          try {
            key = opts.vault.deriveAtPath(chain, path, { account, index, change: 0 })
          } catch {
            continue
          }
          const balance = await opts.getBalance(chain, key.address)
          if (balance > 0n) {
            discovered.push({ path, address: key.address, balance })
          }
        }
      }

      if (discovered.length > 0) {
        results.push({ chain, account, discovered })
      }
    }
  }

  return results
}

export type ChainPathLock = {
  chain: Chain
  account: number
  path: string
  address: string
  balance: bigint
}

export type ChainPathLockSet = Partial<Record<Chain, ChainPathLock>>

export async function discoverAndLockChainPaths(opts: {
  vault: DeterministicVault
  chains: Chain[]
  maxAccounts: number
  maxAddrsPerAccount: number
  getBalance: (chain: Chain, address: string) => Promise<bigint>
}): Promise<{
  discoveries: Array<{
    chain: Chain
    account: number
    discovered: Array<{ path: string; address: string; balance: bigint }>
  }>
  locks: ChainPathLockSet
}> {
  const discoveries = await discoverAccountsAndAddresses(opts)
  const locks: ChainPathLockSet = {}

  for (const chain of opts.chains) {
    const chainHits = discoveries.filter((entry) => entry.chain === chain)
    const flattened = chainHits.flatMap((entry) =>
      entry.discovered.map((hit) => ({
        chain,
        account: entry.account,
        path: hit.path,
        address: hit.address,
        balance: hit.balance,
      })),
    )

    if (!flattened.length) continue

    let best = flattened[0]
    for (const candidate of flattened.slice(1)) {
      if (candidate.balance > best.balance) {
        best = candidate
      }
    }
    locks[chain] = best
  }

  return { discoveries, locks }
}
