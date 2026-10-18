import type { Chain, WalletMaterial, WalletSecurityProfile } from '@/lib/wallet'

export type WalletSpaceId = 'main' | 'hidden'
export type UxPhase = 'setup' | 'recovery' | 'provisioning' | 'ready' | 'error'

export type NetworkPreview = {
  chain: Chain
  networkLabel: string
  account: number
  address: string
}

export type VaultSpacePreview = {
  id: WalletSpaceId
  title: string
  visibilityLabel: string
  networks: NetworkPreview[]
}

export type WalletPreview = {
  activeAddress: string
  wordCount: number
  spaces: VaultSpacePreview[]
}

export type WalletDraft = {
  mnemonic: string
  wordCount: number
  main: WalletMaterial
  hidden?: WalletMaterial
  hiddenPassphrase: string
}

export type KeystoreFile = {
  address: string
  encrypted: string
  wordCount: number
  securityProfile: WalletSecurityProfile
}

export type PassphraseStrength = 'weak' | 'good' | 'strong'

export type PassphraseValidation = {
  hasValue: boolean
  length: number
  hasUppercase: boolean
  hasLowercase: boolean
  hasNumber: boolean
  hasSpecial: boolean
  hasNoPattern: boolean
  isValid: boolean
  strength: PassphraseStrength
}

export const MIN_PASSPHRASE_LENGTH = 16
const RECOMMENDED_PASSPHRASE_LENGTH = 20
const STRONG_PASSPHRASE_LENGTH = 32
const GENERATED_PASSPHRASE_LENGTH = 32
const UPPERCASE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const LOWERCASE_CHARS = 'abcdefghijkmnopqrstuvwxyz'
const NUMBER_CHARS = '23456789'
const SPECIAL_CHARS = '!@#$%^&*'
const ALL_PASSPHRASE_CHARS = `${UPPERCASE_CHARS}${LOWERCASE_CHARS}${NUMBER_CHARS}${SPECIAL_CHARS}`
const COMMON_WORD_PATTERN = /(password|wallet|crypto|qwerty|letmein|admin|secret)/i
const REPEATED_PATTERN = /(.)\1{2,}/
const SEQUENCE_PATTERN = /(0123|1234|2345|3456|4567|5678|6789|7890|abcd|bcde|cdef|defg|qwer|asdf|zxcv)/i
const RECOVERY_WORD_CHECK_COUNT = 3

export const PREVIEW_NETWORKS: Array<{ chain: Chain; networkLabel: string; account: number }> = [
  { chain: 'ETH', networkLabel: 'Ethereum', account: 0 },
  { chain: 'BTC', networkLabel: 'Bitcoin', account: 0 },
  { chain: 'XRPL_ED', networkLabel: 'XRPL', account: 0 },
]

function randomInt(max: number): number {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const array = new Uint32Array(1)
    crypto.getRandomValues(array)
    return array[0] % max
  }
  return Math.floor(Math.random() * max)
}

function randomChar(chars: string): string {
  return chars[randomInt(chars.length)] ?? 'A'
}

function shuffleChars(input: string[]): string[] {
  const copy = [...input]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1)
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function createSuggestedPassphrase(): string {
  const chars: string[] = [
    randomChar(UPPERCASE_CHARS),
    randomChar(LOWERCASE_CHARS),
    randomChar(NUMBER_CHARS),
    randomChar(SPECIAL_CHARS),
  ]
  while (chars.length < GENERATED_PASSPHRASE_LENGTH) {
    chars.push(randomChar(ALL_PASSPHRASE_CHARS))
  }
  return shuffleChars(chars).join('')
}

export function createStrongSuggestedPassphrase(): string {
  for (let attempts = 0; attempts < 40; attempts += 1) {
    const candidate = createSuggestedPassphrase()
    const validation = evaluatePassphrase(candidate)
    if (validation.isValid && validation.strength === 'strong') {
      return candidate
    }
  }
  return 'V7!mN3@pQ5#rT8$sW2&xY4*zK6^hL9'
}

export function createStrongMnemonicPassphrase(): string {
  return createStrongSuggestedPassphrase()
}

export function evaluatePassphrase(value: string): PassphraseValidation {
  const passphrase = value.trim()
  const length = passphrase.length
  const hasValue = length > 0
  const hasUppercase = /[A-Z]/.test(passphrase)
  const hasLowercase = /[a-z]/.test(passphrase)
  const hasNumber = /[0-9]/.test(passphrase)
  const hasSpecial = /[!@#$%^&*]/.test(passphrase)
  const hasPattern =
    COMMON_WORD_PATTERN.test(passphrase) ||
    REPEATED_PATTERN.test(passphrase) ||
    SEQUENCE_PATTERN.test(passphrase)
  const hasNoPattern = !hasPattern
  const isValid =
    length >= MIN_PASSPHRASE_LENGTH &&
    hasUppercase &&
    hasLowercase &&
    hasNumber &&
    hasSpecial &&
    hasNoPattern

  let strength: PassphraseStrength = 'weak'
  if (isValid && length >= STRONG_PASSPHRASE_LENGTH) {
    strength = 'strong'
  } else if (isValid && length >= RECOMMENDED_PASSPHRASE_LENGTH) {
    strength = 'good'
  }

  return {
    hasValue,
    length,
    hasUppercase,
    hasLowercase,
    hasNumber,
    hasSpecial,
    hasNoPattern,
    isValid,
    strength,
  }
}

export function normalizeWord(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? ''
}

export function buildRecoveryWordSlots(wordCount: number, count = RECOVERY_WORD_CHECK_COUNT): number[] {
  const slots = new Set<number>()
  while (slots.size < count) {
    slots.add(randomInt(wordCount))
  }
  return [...slots].sort((a, b) => a - b)
}

export function buildKeystoreFile(payload: KeystoreFile): string {
  return JSON.stringify(
    {
      format: 'aljama-keystore',
      version: 2,
      createdAt: new Date().toISOString(),
      wallet: {
        address: payload.address,
        recoveryWords: payload.wordCount,
      },
      encryption: {
        algorithm: 'AES-256-GCM',
        kdf: 'PBKDF2',
      },
      security: {
        profileVersion: payload.securityProfile.version,
        keyManagement: payload.securityProfile.keyManagement,
        signingAlgorithm: payload.securityProfile.signingAlgorithm,
        migration: payload.securityProfile.migration,
      },
      encrypted: payload.encrypted,
    },
    null,
    2,
  )
}

export function mapUxToEngineState(phase: UxPhase, hasHiddenVault: boolean): string {
  switch (phase) {
    case 'setup':
      return 'Seed locked'
    case 'recovery':
      return 'Recovery verification'
    case 'provisioning':
      return hasHiddenVault ? 'Main + hidden vault provisioning' : 'Main vault provisioning'
    case 'ready':
      return hasHiddenVault ? 'Main + hidden vault sealed' : 'Main vault active'
    case 'error':
      return 'Action required'
    default:
      return 'Seed locked'
  }
}

export function buildFallbackSpace(
  id: WalletSpaceId,
  title: string,
  visibilityLabel: string,
  address: string,
): VaultSpacePreview {
  return {
    id,
    title,
    visibilityLabel,
    networks: PREVIEW_NETWORKS.map((network) => ({
      chain: network.chain,
      networkLabel: network.networkLabel,
      account: network.account,
      address: network.chain === 'ETH' ? address : '—',
    })),
  }
}
