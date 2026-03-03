'use client'

import type { ClipboardEvent, FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useDynamicInfoStore } from '@/hooks/useDynamicInfoStore'
import { clearWalletId, persistEncryptedSession } from '@/lib/storage/walletSession'
import {
  DEFAULT_WALLET_SECURITY_PROFILE,
  UserDeterministicWallet,
  deriveWalletFromMnemonic,
  encodeWalletToEncrypted,
  generateMnemonicWallet,
  type Chain,
  type WalletSecurityProfile,
  type WalletMaterial,
} from '@/lib/wallet'
import { useComponentTelemetry } from '@/infra/telemetry/useComponentTelemetry'
import { useTranslations } from 'next-intl'
import { useSession } from 'next-auth/react'
import { buildOnRampUrl, isUsingDefaultOnRampTemplate } from '@/lib/payment/onramp'
import UnlockActionsLink from '@/components/ui/UnlockActionsLink.client'

type WalletSpaceId = 'main' | 'hidden'
type UxPhase = 'setup' | 'recovery' | 'provisioning' | 'ready' | 'error'

type NetworkPreview = {
  chain: Chain
  networkLabel: string
  account: number
  address: string
}

type VaultSpacePreview = {
  id: WalletSpaceId
  title: string
  visibilityLabel: string
  networks: NetworkPreview[]
}

type WalletPreview = {
  activeAddress: string
  wordCount: number
  spaces: VaultSpacePreview[]
}

type WalletDraft = {
  mnemonic: string
  wordCount: number
  main: WalletMaterial
  hidden?: WalletMaterial
  hiddenPassphrase: string
}

type KeystoreFile = {
  address: string
  encrypted: string
  wordCount: number
  securityProfile: WalletSecurityProfile
}

type Status = 'idle' | 'pending' | 'success' | 'error'

const DEPOSIT_NETWORKS = ['Ethereum', 'Base', 'Arbitrum', 'Optimism', 'Polygon']
const MIN_PASSPHRASE_LENGTH = 16
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
const PREVIEW_NETWORKS: Array<{ chain: Chain; networkLabel: string; account: number }> = [
  { chain: 'ETH', networkLabel: 'Ethereum', account: 0 },
  { chain: 'BTC', networkLabel: 'Bitcoin', account: 0 },
  { chain: 'XRPL_ED', networkLabel: 'XRPL', account: 0 },
]

type PassphraseStrength = 'weak' | 'good' | 'strong'
type PassphraseValidation = {
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

function createStrongSuggestedPassphrase(): string {
  for (let attempts = 0; attempts < 40; attempts += 1) {
    const candidate = createSuggestedPassphrase()
    const validation = evaluatePassphrase(candidate)
    if (validation.isValid && validation.strength === 'strong') {
      return candidate
    }
  }
  return 'V7!mN3@pQ5#rT8$sW2&xY4*zK6^hL9'
}

function createStrongMnemonicPassphrase(): string {
  return createStrongSuggestedPassphrase()
}

function evaluatePassphrase(value: string): PassphraseValidation {
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

function normalizeWord(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? ''
}

function buildRecoveryWordSlots(wordCount: number, count = RECOVERY_WORD_CHECK_COUNT): number[] {
  const slots = new Set<number>()
  while (slots.size < count) {
    slots.add(randomInt(wordCount))
  }
  return [...slots].sort((a, b) => a - b)
}

function buildKeystoreFile(payload: KeystoreFile): string {
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

function mapUxToEngineState(phase: UxPhase, hasHiddenVault: boolean): string {
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

function buildFallbackSpace(
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

export function CreateWalletPanel() {
  useComponentTelemetry('CreateWalletPanel')
  const t = useTranslations('createWallet')
  const tActions = useTranslations('actions')
  const tAuth = useTranslations('auth')
  const { status: sessionStatus } = useSession()
  const locked = sessionStatus !== 'authenticated'
  const showUnlockMessage = sessionStatus === 'unauthenticated'
  const [password, setPassword] = useState('')
  const [mnemonicPassphrase, setMnemonicPassphrase] = useState('')
  const [useOptionalMnemonicPassphrase, setUseOptionalMnemonicPassphrase] = useState(false)
  const [status, setStatus] = useState<Status>('idle')
  const [phase, setPhase] = useState<UxPhase>('setup')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [mode, setMode] = useState<'custody' | 'session-only' | null>(null)
  const [walletPreview, setWalletPreview] = useState<WalletPreview | null>(null)
  const [walletDraft, setWalletDraft] = useState<WalletDraft | null>(null)
  const [recoveryWordSlots, setRecoveryWordSlots] = useState<number[]>([])
  const [recoveryWords, setRecoveryWords] = useState<Record<number, string>>({})
  const [recoveryBackedUp, setRecoveryBackedUp] = useState(false)
  const [recoveryLossAccepted, setRecoveryLossAccepted] = useState(false)
  const [keystoreFile, setKeystoreFile] = useState<KeystoreFile | null>(null)
  const [addressCopied, setAddressCopied] = useState(false)
  const [passphraseCopied, setPassphraseCopied] = useState(false)
  const [mnemonicPassphraseCopied, setMnemonicPassphraseCopied] = useState(false)
  const [mnemonicCopied, setMnemonicCopied] = useState(false)
  const [keystoreDownloaded, setKeystoreDownloaded] = useState(false)
  const setCreateWalletStatus = useDynamicInfoStore((s) => s.setCreateWalletStatus)
  const setCreatedWalletAddress = useDynamicInfoStore((s) => s.setCreatedWalletAddress)
  const titleId = 'create-wallet-title'
  const bodyId = 'create-wallet-body'
  const engineStateId = 'create-wallet-engine-state'
  const formHintId = 'create-wallet-form-hint'
  const passwordInputId = 'create-wallet-password'
  const passwordRulesId = 'create-wallet-password-rules'
  const passwordStrengthId = 'create-wallet-password-strength'
  const mnemonicToggleLabelId = 'create-wallet-mnemonic-toggle-label'
  const mnemonicToggleHintId = 'create-wallet-mnemonic-toggle-hint'
  const mnemonicPassphraseInputId = 'create-wallet-mnemonic-passphrase'
  const mnemonicPassphraseLabelId = 'create-wallet-mnemonic-passphrase-label'
  const mnemonicPassphraseHintId = 'create-wallet-mnemonic-passphrase-hint'
  const recoveryTitleId = 'create-wallet-recovery-title'
  const recoveryHintId = 'create-wallet-recovery-hint'
  const readyStatusId = 'create-wallet-ready-status'
  const noticeId = 'create-wallet-notice'
  const errorId = 'create-wallet-error'
  const clipboardStatusId = 'create-wallet-clipboard-status'

  const passphraseValidation = useMemo(() => evaluatePassphrase(password), [password])
  const onRampTemplate = process.env.NEXT_PUBLIC_ONRAMP_URL_TEMPLATE
  const usingDefaultOnRamp = isUsingDefaultOnRampTemplate(onRampTemplate)
  const onRampUrl = walletPreview ? buildOnRampUrl(walletPreview.activeAddress, onRampTemplate) : undefined
  const strengthLevel =
    passphraseValidation.strength === 'strong' ? 3 : passphraseValidation.strength === 'good' ? 2 : 1
  const strengthFillWidth = strengthLevel === 3 ? '100%' : strengthLevel === 2 ? '66%' : '33%'
  const strengthFillTone =
    passphraseValidation.strength === 'strong'
      ? 'from-emerald-300 via-emerald-400 to-jade'
      : passphraseValidation.strength === 'good'
        ? 'from-[#f0d7a0] via-[#dda469] to-[#c7794a]'
        : 'from-rose-300 via-rose-400 to-red-500'
  const actionButtonClass =
    'inline-flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 text-base font-semibold tracking-wide transition hover:scale-[1.02] hover:shadow-xl focus:outline-none disabled:cursor-not-allowed disabled:opacity-60'

  const draftWords = useMemo(() => walletDraft?.mnemonic.split(' ') ?? [], [walletDraft])
  const engineStateLabel = useMemo(
    () => mapUxToEngineState(phase, Boolean(walletDraft?.hidden || walletPreview?.spaces.some((space) => space.id === 'hidden'))),
    [phase, walletDraft?.hidden, walletPreview?.spaces],
  )
  const verifyRecoveryWords = useMemo(() => {
    if (!walletDraft || recoveryWordSlots.length === 0) {
      return false
    }

    return recoveryWordSlots.every((slot) => {
      const expected = normalizeWord(draftWords[slot])
      const actual = normalizeWord(recoveryWords[slot])
      return expected.length > 0 && expected === actual
    })
  }, [walletDraft, recoveryWordSlots, recoveryWords, draftWords])

  const isRecoveryStep = Boolean(walletDraft) && status !== 'success'
  const disabled =
    locked ||
    status === 'pending' ||
    !passphraseValidation.isValid ||
    (isRecoveryStep && (!verifyRecoveryWords || !recoveryBackedUp || !recoveryLossAccepted))
  const passwordInvalid = status === 'error' && (!passphraseValidation.hasValue || !passphraseValidation.isValid)
  const clipboardStatusMessage = addressCopied
    ? t('copiedAddress')
    : passphraseCopied
      ? t('copiedPassphrase')
      : mnemonicPassphraseCopied
        ? t('copiedPassphrase')
        : mnemonicCopied
          ? t('copiedMnemonic')
          : keystoreDownloaded
            ? t('keystoreDownloaded')
            : ''

  useEffect(() => {
    if (!addressCopied) return
    const timeout = window.setTimeout(() => setAddressCopied(false), 1800)
    return () => window.clearTimeout(timeout)
  }, [addressCopied])

  useEffect(() => {
    if (!passphraseCopied) return
    const timeout = window.setTimeout(() => setPassphraseCopied(false), 1800)
    return () => window.clearTimeout(timeout)
  }, [passphraseCopied])

  useEffect(() => {
    if (!mnemonicPassphraseCopied) return
    const timeout = window.setTimeout(() => setMnemonicPassphraseCopied(false), 1800)
    return () => window.clearTimeout(timeout)
  }, [mnemonicPassphraseCopied])

  useEffect(() => {
    if (!mnemonicCopied) return
    const timeout = window.setTimeout(() => setMnemonicCopied(false), 1800)
    return () => window.clearTimeout(timeout)
  }, [mnemonicCopied])

  useEffect(() => {
    if (!keystoreDownloaded) return
    const timeout = window.setTimeout(() => setKeystoreDownloaded(false), 1800)
    return () => window.clearTimeout(timeout)
  }, [keystoreDownloaded])

  const copyAddress = async () => {
    if (!walletPreview) return
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return
    try {
      await navigator.clipboard.writeText(walletPreview.activeAddress)
      setAddressCopied(true)
    } catch {
      // ignore clipboard failures
    }
  }

  const copyPassphrase = async () => {
    const passphrase = password.trim()
    if (!passphrase) return
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return

    try {
      await navigator.clipboard.writeText(passphrase)
      setPassphraseCopied(true)
    } catch {
      // ignore clipboard failures
    }
  }

  const copyMnemonic = async () => {
    if (!walletDraft) return
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return

    const phrase = walletDraft.mnemonic.trim()
    if (!phrase) return

    const optionalPassphrase = useOptionalMnemonicPassphrase ? mnemonicPassphrase.trim() : ''
    const payload = optionalPassphrase
      ? `${phrase}\n\nHidden vault passphrase (25th word): ${optionalPassphrase}`
      : phrase

    try {
      await navigator.clipboard.writeText(payload)
      setMnemonicCopied(true)
      setNotice(null)
    } catch {
      // ignore clipboard failures
    }
  }

  const copyMnemonicPassphrase = async () => {
    const passphrase = mnemonicPassphrase.trim()
    if (!passphrase) return
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return

    try {
      await navigator.clipboard.writeText(passphrase)
      setMnemonicPassphraseCopied(true)
      setNotice(null)
    } catch {
      // ignore clipboard failures
    }
  }

  const preventSensitiveCopy = (event: ClipboardEvent<HTMLElement>) => {
    event.preventDefault()
    setNotice(t('copyDisabledNotice'))
  }

  const downloadKeystore = () => {
    if (!keystoreFile || typeof window === 'undefined') return

    const filename = `aljama-keystore-${keystoreFile.address.slice(2, 10)}.json`
    const blob = new Blob([buildKeystoreFile(keystoreFile)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)

    try {
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      setKeystoreDownloaded(true)
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  const generatePassphrase = () => {
    if (locked || status === 'pending') return
    const next = createStrongSuggestedPassphrase()
    setPassword(next)
    setError(null)
    if (status === 'error') setStatus('idle')
  }

  const generateOptionalMnemonicPassphrase = () => {
    if (locked || status === 'pending') return
    setMnemonicPassphrase(createStrongMnemonicPassphrase())
    setError(null)
    if (status === 'error') setStatus('idle')
  }

  const beginRecoveryStep = () => {
    const baseDraft = generateMnemonicWallet({ wordCount: 24 })
    const hiddenPassphrase = useOptionalMnemonicPassphrase ? mnemonicPassphrase.trim() : ''

    let hiddenWallet: WalletMaterial | undefined
    if (hiddenPassphrase) {
      hiddenWallet = deriveWalletFromMnemonic({
        mnemonic: baseDraft.mnemonic,
        mnemonicPassphrase: hiddenPassphrase,
      })
    }

    const nextDraft: WalletDraft = {
      mnemonic: baseDraft.mnemonic,
      wordCount: baseDraft.wordCount,
      main: { address: baseDraft.address, privateKey: baseDraft.privateKey },
      hidden: hiddenWallet,
      hiddenPassphrase,
    }

    const recoverySlots = buildRecoveryWordSlots(nextDraft.wordCount)
    setWalletDraft(nextDraft)
    setRecoveryWordSlots(recoverySlots)
    setRecoveryWords({})
    setRecoveryBackedUp(false)
    setRecoveryLossAccepted(false)
    setPhase('recovery')
    setStatus('idle')
    setNotice(t('verifyPrompt'))
    setCreateWalletStatus('idle')
  }

  const finalizeWallet = async (draft: WalletDraft) => {
    const encrypted = await encodeWalletToEncrypted(
      {
        address: draft.main.address,
        privateKey: draft.main.privateKey,
      },
      password.trim(),
    )

    persistEncryptedSession(encrypted)
    clearWalletId()

    let spaces: VaultSpacePreview[] = []
    try {
      const deterministic = new UserDeterministicWallet(draft.mnemonic)
      const mainSpace: VaultSpacePreview = {
        id: 'main',
        title: t('mainWalletTitle'),
        visibilityLabel: t('walletVisibilityMain'),
        networks: PREVIEW_NETWORKS.map((network) => {
          const key = deterministic.publicVault.derive({
            chain: network.chain,
            account: network.account,
            change: 0,
            index: 0,
          })
          return {
            chain: network.chain,
            networkLabel: network.networkLabel,
            account: network.account,
            address: key.address,
          }
        }),
      }
      spaces.push(mainSpace)

      if (draft.hiddenPassphrase) {
        deterministic.unlockPrivateVault(draft.hiddenPassphrase)
        const hiddenSpace: VaultSpacePreview = {
          id: 'hidden',
          title: t('hiddenVaultTitle'),
          visibilityLabel: t('walletVisibilityHidden'),
          networks: PREVIEW_NETWORKS.map((network) => {
            const key = deterministic.privateVault.derive({
              chain: network.chain,
              account: network.account,
              change: 0,
              index: 0,
            })
            return {
              chain: network.chain,
              networkLabel: network.networkLabel,
              account: network.account,
              address: key.address,
            }
          }),
        }
        spaces.push(hiddenSpace)
        deterministic.lockPrivateVault()
      }
    } catch {
      spaces = [
        buildFallbackSpace('main', t('mainWalletTitle'), t('walletVisibilityMain'), draft.main.address),
        ...(draft.hidden
          ? [buildFallbackSpace('hidden', t('hiddenVaultTitle'), t('walletVisibilityHidden'), draft.hidden.address)]
          : []),
      ]
    }

    setWalletPreview({
      activeAddress: draft.main.address,
      wordCount: draft.wordCount,
      spaces,
    })
    setKeystoreFile({
      address: draft.main.address,
      encrypted,
      wordCount: draft.wordCount,
      securityProfile: DEFAULT_WALLET_SECURITY_PROFILE,
    })

    setMode('session-only')
    setPhase('ready')
    setStatus('success')
    setNotice(t('localOnlyNotice'))
    setCreateWalletStatus('success')
    setCreatedWalletAddress(draft.main.address)
    setWalletDraft(null)
    setRecoveryWordSlots([])
    setRecoveryWords({})
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()

    if (locked) {
      if (sessionStatus === 'loading') return
      setError(tAuth('unlockActions'))
      setStatus('error')
      return
    }

    if (!passphraseValidation.hasValue) {
      setError(t('passphraseRequired'))
      setStatus('error')
      return
    }

    if (!passphraseValidation.isValid) {
      setError(t('passphraseTooWeak'))
      setStatus('error')
      return
    }

    setStatus('pending')
    setError(null)
    setNotice(null)

    try {
      if (!walletDraft) {
        beginRecoveryStep()
        return
      }

      if (!verifyRecoveryWords) {
        throw new Error(t('recoveryWordsMismatch'))
      }

      if (!recoveryBackedUp || !recoveryLossAccepted) {
        throw new Error(t('recoveryAckRequired'))
      }

      setPhase('provisioning')
      setCreateWalletStatus('pending')
      await finalizeWallet(walletDraft)
    } catch (err) {
      console.error('Wallet creation failed', err)
      const message = err instanceof Error ? err.message : t('createFailed')
      setError(message)
      setStatus('error')
      setPhase('error')
      setCreateWalletStatus('error', message)
    }
  }

  const badgeColor = status === 'success' ? 'bg-jade/20 text-jade' : 'bg-white/5 text-ivory/70'

  return (
    <section
      aria-labelledby={titleId}
      aria-describedby={`${bodyId} ${engineStateId} ${formHintId}`}
      className="surface-panel panel-glow-saffron relative p-7 sm:p-8"
    >
      <div className="absolute inset-x-8 top-5 ornament-line" />

      <header className="relative flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-saffron/70">{t('eyebrow')}</p>
          <h2 id={titleId} className="mt-3 font-display text-2xl font-semibold text-ivory sm:text-3xl">
            {t('title')}
          </h2>
          <p id={bodyId} className="text-sm text-ivory/70">
            {t('body')}
          </p>
        </div>
        <span
          aria-live="polite"
          className={`rounded-full px-3 py-1 text-xs font-semibold tracking-wide ${badgeColor}`}
        >
          {status === 'success' ? t('badgeReady') : t('badgeCustody')}
        </span>
      </header>

      <p id={engineStateId} aria-live="polite" className="mt-3 text-[11px] uppercase tracking-[0.18em] text-ivory/45">
        {t('engineStateLabel')}: {engineStateLabel}
      </p>

      <form
        onSubmit={submit}
        aria-describedby={[
          engineStateId,
          formHintId,
          notice ? noticeId : null,
          error ? errorId : null,
          clipboardStatusMessage ? clipboardStatusId : null,
        ].filter(Boolean).join(' ')}
        aria-busy={status === 'pending'}
        className="relative mt-6 space-y-4"
      >
        <label
          htmlFor={passwordInputId}
          className="block text-xs uppercase tracking-[0.16em] text-ivory/60"
        >
          {t('passwordLabel')}
        </label>

        <div className="space-y-3">
          <div className="surface-inner flex w-full items-center gap-3 px-4 py-3 focus-within:border-saffron/50 focus-within:ring-2 focus-within:ring-saffron/25">
            <span className="min-w-[7.25rem] shrink-0 text-xs uppercase tracking-[0.2em] text-saffron/70">
              {t('passwordTag')}
            </span>
            <input
              id={passwordInputId}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t('passwordPlaceholder')}
              disabled={locked || status === 'pending'}
              aria-invalid={passwordInvalid}
              aria-describedby={[
                formHintId,
                passphraseValidation.hasValue ? passwordRulesId : null,
                error ? errorId : null,
              ].filter(Boolean).join(' ')}
              autoComplete="new-password"
              className="w-full bg-transparent text-base text-ivory placeholder:text-ivory/40 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>

          <div className="surface-inner flex w-full items-center gap-3 px-4 py-3 focus-within:border-lapis/50 focus-within:ring-2 focus-within:ring-lapis/25">
            <div className="flex-1">
              <p id={mnemonicToggleLabelId} className="text-xs uppercase tracking-[0.2em] text-lapis/75">
                {t('mnemonicToggleLabel')}
              </p>
              <p id={mnemonicToggleHintId} className="mt-1 text-[11px] text-ivory/55">
                {t('mnemonicToggleHint')}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={useOptionalMnemonicPassphrase}
              aria-labelledby={mnemonicToggleLabelId}
              aria-describedby={mnemonicToggleHintId}
              onClick={() => {
                if (locked || status === 'pending') return
                setUseOptionalMnemonicPassphrase((prev) => {
                  const next = !prev
                  if (!next) setMnemonicPassphrase('')
                  return next
                })
              }}
              disabled={locked || status === 'pending'}
              className="relative h-7 w-12 rounded-full border border-white/20 bg-white/10 transition disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span
                aria-hidden="true"
                className={`absolute top-0.5 h-[22px] w-[22px] rounded-full bg-white transition ${
                  useOptionalMnemonicPassphrase
                    ? 'left-6 bg-white shadow-[0_0_12px_rgba(240,215,160,0.35)]'
                    : 'left-0.5 bg-white/95'
                }`}
              />
            </button>
          </div>

          {useOptionalMnemonicPassphrase && (
            <>
              <div className="surface-inner flex w-full items-center gap-3 px-4 py-3 focus-within:border-lapis/50 focus-within:ring-2 focus-within:ring-lapis/25">
                <span
                  id={mnemonicPassphraseLabelId}
                  className="min-w-[7.25rem] shrink-0 text-xs uppercase tracking-[0.2em] text-lapis/75"
                >
                  {t('mnemonicPassphraseTag')}
                </span>
                <input
                  id={mnemonicPassphraseInputId}
                  type="password"
                  value={mnemonicPassphrase}
                  onChange={(event) => setMnemonicPassphrase(event.target.value)}
                  onCopy={preventSensitiveCopy}
                  onCut={preventSensitiveCopy}
                  placeholder={t('mnemonicPassphrasePlaceholder')}
                  disabled={locked || status === 'pending'}
                  aria-labelledby={mnemonicPassphraseLabelId}
                  aria-describedby={mnemonicPassphraseHintId}
                  autoComplete="new-password"
                  className="w-full bg-transparent text-base text-ivory placeholder:text-ivory/40 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>
              <p id={mnemonicPassphraseHintId} className="text-xs text-ivory/55">
                {t('mnemonicPassphraseHint')}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={generateOptionalMnemonicPassphrase}
                  disabled={locked || status === 'pending'}
                  className="inline-flex items-center justify-center rounded-lg border border-lapis/45 bg-lapis/20 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-ivory transition hover:bg-lapis/28 focus:outline-none focus:ring-2 focus:ring-lapis/35 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {t('generateMnemonicPassphrase')}
                </button>
                <button
                  type="button"
                  onClick={() => void copyMnemonicPassphrase()}
                  disabled={locked || status === 'pending' || !mnemonicPassphrase.trim()}
                  className="inline-flex items-center justify-center rounded-lg border border-lapis/45 bg-lapis/18 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-lapis transition hover:bg-lapis/28 focus:outline-none focus:ring-2 focus:ring-lapis/30 disabled:cursor-not-allowed disabled:opacity-80"
                >
                  {mnemonicPassphraseCopied ? t('copiedPassphrase') : t('copyPassphrase')}
                </button>
              </div>
            </>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <button
              type="button"
              onClick={generatePassphrase}
              disabled={locked || status === 'pending'}
              className={`${actionButtonClass} text-ivory shadow-lg shadow-[#4b7c79]/30 focus:ring-2 focus:ring-lapis/40`}
              style={{
                backgroundImage:
                  'linear-gradient(to right in oklab, rgb(127, 176, 217) 0%, rgb(92, 141, 180) 50%, rgb(75, 124, 121) 100%)',
              }}
            >
              {t('generatePassphrase')}
            </button>

            <button
              type="submit"
              disabled={disabled}
              className={`${actionButtonClass} bg-gradient-to-r from-[#f0d7a0] via-[#dda469] to-[#c7794a] text-ivory shadow-lg shadow-[#c7794a]/30 focus:ring-2 focus:ring-saffron/30`}
            >
              {status === 'pending'
                ? tActions('creating')
                : isRecoveryStep
                  ? t('verifyAndFinalize')
                  : t('button')}
            </button>
          </div>
        </div>
        <p id={formHintId} className="text-xs text-ivory/55">
          {t('flowHint')}
        </p>

        {showUnlockMessage && <UnlockActionsLink className="text-xs uppercase tracking-[0.18em] text-ivory/50" />}

        {passphraseValidation.hasValue && (
          <div
            id={passwordRulesId}
            aria-live="polite"
            className="surface-inner relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#121820] via-[#0d1118] to-[#16120f] p-4"
          >
            <div className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-lapis/20 blur-2xl" />
            <div className="pointer-events-none absolute -left-10 bottom-0 h-24 w-24 rounded-full bg-saffron/15 blur-2xl" />
            <div className="relative space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs uppercase tracking-[0.16em] text-ivory/60">{t('strengthLabel')}</p>
                <span
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${
                    passphraseValidation.strength === 'strong'
                      ? 'border-emerald-300/40 bg-emerald-300/10 text-emerald-200'
                      : passphraseValidation.strength === 'good'
                        ? 'border-saffron/40 bg-saffron/10 text-saffron'
                        : 'border-rose-300/40 bg-rose-300/10 text-rose-200'
                  }`}
                >
                  {t(`strength.${passphraseValidation.strength}`)}
                </span>
              </div>
              <div
                id={passwordStrengthId}
                className="rounded-full border border-white/10 bg-black/35 p-1"
                role="progressbar"
                aria-label={t('strengthLabel')}
                aria-valuemin={1}
                aria-valuemax={3}
                aria-valuenow={strengthLevel}
                aria-valuetext={t(`strength.${passphraseValidation.strength}`)}
              >
                <div
                  className={`h-2 rounded-full bg-gradient-to-r ${strengthFillTone} transition-all duration-300`}
                  style={{ width: strengthFillWidth }}
                />
              </div>
              <p className="text-[11px] text-ivory/65">{t('strengthHint')}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div
                  className={`rounded-xl border px-3 py-2 ${
                    passphraseValidation.length >= MIN_PASSPHRASE_LENGTH
                      ? 'border-emerald-300/35 bg-emerald-300/10 text-emerald-100'
                      : 'border-rose-300/35 bg-rose-300/10 text-rose-100'
                  }`}
                >
                  <p className="text-[10px] font-semibold tracking-[0.12em]">
                    {passphraseValidation.length >= MIN_PASSPHRASE_LENGTH ? 'OK' : 'NO'}
                  </p>
                  <p className="mt-0.5 text-[11px]">{t('ruleLength')}</p>
                </div>
                <div
                  className={`rounded-xl border px-3 py-2 ${
                    passphraseValidation.hasUppercase
                      ? 'border-emerald-300/35 bg-emerald-300/10 text-emerald-100'
                      : 'border-rose-300/35 bg-rose-300/10 text-rose-100'
                  }`}
                >
                  <p className="text-[10px] font-semibold tracking-[0.12em]">
                    {passphraseValidation.hasUppercase ? 'OK' : 'NO'}
                  </p>
                  <p className="mt-0.5 text-[11px]">{t('ruleUpper')}</p>
                </div>
                <div
                  className={`rounded-xl border px-3 py-2 ${
                    passphraseValidation.hasLowercase
                      ? 'border-emerald-300/35 bg-emerald-300/10 text-emerald-100'
                      : 'border-rose-300/35 bg-rose-300/10 text-rose-100'
                  }`}
                >
                  <p className="text-[10px] font-semibold tracking-[0.12em]">
                    {passphraseValidation.hasLowercase ? 'OK' : 'NO'}
                  </p>
                  <p className="mt-0.5 text-[11px]">{t('ruleLower')}</p>
                </div>
                <div
                  className={`rounded-xl border px-3 py-2 ${
                    passphraseValidation.hasNumber
                      ? 'border-emerald-300/35 bg-emerald-300/10 text-emerald-100'
                      : 'border-rose-300/35 bg-rose-300/10 text-rose-100'
                  }`}
                >
                  <p className="text-[10px] font-semibold tracking-[0.12em]">
                    {passphraseValidation.hasNumber ? 'OK' : 'NO'}
                  </p>
                  <p className="mt-0.5 text-[11px]">{t('ruleNumber')}</p>
                </div>
                <div
                  className={`rounded-xl border px-3 py-2 ${
                    passphraseValidation.hasSpecial
                      ? 'border-emerald-300/35 bg-emerald-300/10 text-emerald-100'
                      : 'border-rose-300/35 bg-rose-300/10 text-rose-100'
                  }`}
                >
                  <p className="text-[10px] font-semibold tracking-[0.12em]">
                    {passphraseValidation.hasSpecial ? 'OK' : 'NO'}
                  </p>
                  <p className="mt-0.5 text-[11px]">{t('ruleSpecial')}</p>
                </div>
                <div
                  className={`rounded-xl border px-3 py-2 ${
                    passphraseValidation.hasNoPattern
                      ? 'border-emerald-300/35 bg-emerald-300/10 text-emerald-100'
                      : 'border-rose-300/35 bg-rose-300/10 text-rose-100'
                  }`}
                >
                  <p className="text-[10px] font-semibold tracking-[0.12em]">
                    {passphraseValidation.hasNoPattern ? 'OK' : 'NO'}
                  </p>
                  <p className="mt-0.5 text-[11px]">{t('rulePattern')}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {walletDraft && status !== 'success' && (
          <div
            className="surface-inner space-y-4 rounded-2xl border border-saffron/25 bg-black/25 p-4"
            aria-labelledby={recoveryTitleId}
            aria-describedby={recoveryHintId}
          >
            <p id={recoveryTitleId} className="text-xs uppercase tracking-[0.16em] text-saffron/75">
              {t('mnemonicTitle')}
            </p>

            <p id={recoveryHintId} className="text-xs text-ivory/65">
              {t('mnemonicHint')}
            </p>
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={() => void copyMnemonic()}
                aria-describedby={`${recoveryHintId} ${clipboardStatusId}`}
                className="rounded-full border border-saffron/35 bg-saffron/10 px-3 py-1.5 text-xs font-semibold text-saffron transition hover:bg-saffron/20"
              >
                {mnemonicCopied ? t('copiedMnemonic') : t('copyMnemonic')}
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {draftWords.map((word, index) => (
                <div key={`${word}-${index}`} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-ivory">
                  <span className="mr-2 font-mono text-xs text-ivory/55">{index + 1}.</span>
                  <span className="font-medium">{word}</span>
                </div>
              ))}
            </div>

            <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-xs uppercase tracking-[0.14em] text-ivory/70">{t('recoveryCheckTitle')}</p>
              {recoveryWordSlots.map((slot) => (
                <label key={slot} className="block">
                  <span className="mb-1 block text-xs text-ivory/60">
                    {t('recoveryWordPrompt', { index: String(slot + 1) })}
                  </span>
                  <input
                    id={`create-wallet-recovery-word-${slot}`}
                    type="text"
                    autoComplete="off"
                    value={recoveryWords[slot] ?? ''}
                    onChange={(event) => {
                      setRecoveryWords((prev) => ({
                        ...prev,
                        [slot]: event.target.value,
                      }))
                    }}
                    aria-describedby={recoveryHintId}
                    aria-required="true"
                    aria-invalid={
                      Boolean(recoveryWords[slot]) &&
                      normalizeWord(recoveryWords[slot]) !== normalizeWord(draftWords[slot])
                    }
                    className="w-full rounded-xl border border-white/15 bg-black/25 px-3 py-2 text-sm text-ivory placeholder:text-ivory/35 focus:border-saffron/50 focus:outline-none"
                    placeholder={t('recoveryWordPlaceholder')}
                    disabled={status === 'pending'}
                  />
                </label>
              ))}

              <label className="flex items-start gap-2 text-xs text-ivory/70">
                <input
                  type="checkbox"
                  checked={recoveryBackedUp}
                  onChange={(event) => setRecoveryBackedUp(event.target.checked)}
                  aria-describedby={recoveryHintId}
                  className="mt-0.5 h-4 w-4 rounded border-white/20 bg-black/40"
                  disabled={status === 'pending'}
                />
                <span>{t('recoveryAckBackedUp')}</span>
              </label>

              <label className="flex items-start gap-2 text-xs text-ivory/70">
                <input
                  type="checkbox"
                  checked={recoveryLossAccepted}
                  onChange={(event) => setRecoveryLossAccepted(event.target.checked)}
                  aria-describedby={recoveryHintId}
                  className="mt-0.5 h-4 w-4 rounded border-white/20 bg-black/40"
                  disabled={status === 'pending'}
                />
                <span>{t('recoveryAckLoss')}</span>
              </label>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 text-xs text-ivory/60">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            {t('tagEncrypted')}
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-saffron" />
            {t('tagPrivate')}
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-lapis" />
            {t('tagBipStandard')}
          </span>
        </div>
      </form>

      <div id={readyStatusId} className="surface-inner relative mt-6 p-4" aria-live="polite">
        {walletPreview ? (
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.16em] text-jade/80">{t('readyTitle')}</p>
            <p className="text-sm text-ivory/70">{t('readyBody')}</p>
            <div className="rounded-xl border border-jade/30 bg-jade/10 px-4 py-3 text-sm text-jade">
              <p className="text-xs uppercase tracking-[0.14em] text-jade/80">{t('addressLabel')}</p>
              <p className="mt-1 break-all font-mono text-base">{walletPreview.activeAddress}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void copyAddress()}
                  aria-describedby={clipboardStatusId}
                  className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-ivory transition hover:bg-white/15"
                >
                  {addressCopied ? t('copiedAddress') : t('copyAddress')}
                </button>
                <button
                  type="button"
                  onClick={downloadKeystore}
                  aria-describedby={clipboardStatusId}
                  className="rounded-full border border-lapis/30 bg-lapis/10 px-3 py-1.5 text-xs font-semibold text-lapis transition hover:bg-lapis/20"
                >
                  {keystoreDownloaded ? t('keystoreDownloaded') : t('downloadKeystore')}
                </button>
                <a
                  href={onRampUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={t('buyWithCard')}
                  className="rounded-full border border-saffron/30 bg-saffron/10 px-3 py-1.5 text-xs font-semibold text-saffron transition hover:bg-saffron/20"
                >
                  {t('buyWithCard')}
                </a>
              </div>
              {usingDefaultOnRamp && <p className="mt-2 text-[11px] text-ivory/55">{t('buyWithCardDisabled')}</p>}
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.14em] text-ivory/80">{t('vaultSpacesTitle')}</p>
              <p className="mt-1 text-xs text-ivory/65">{t('vaultSpacesBody')}</p>
              <div className="mt-3 space-y-3">
                {walletPreview.spaces.map((space) => (
                  <div key={space.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ivory/85">
                        {space.title}
                      </p>
                      <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-ivory/70">
                        {space.visibilityLabel}
                      </span>
                    </div>
                    <div className="mt-2 space-y-2">
                      {space.networks.map((network) => (
                        <div key={`${space.id}-${network.chain}`} className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
                          <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-ivory/60">
                            <span>{network.networkLabel}</span>
                            <span>•</span>
                            <span>
                              {t('accountLabel')} {network.account + 1}
                            </span>
                          </div>
                          <p className="mt-1 break-all font-mono text-xs text-ivory/85">{network.address}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-ivory/55">{t('coercionSafeHint')}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.14em] text-saffron/80">{t('receiveCryptoTitle')}</p>
              <p className="mt-1 text-xs text-ivory/70">{t('receiveCryptoBody')}</p>
              <p className="mt-2 text-[11px] text-jade/80">{t('offlineReceiveNote')}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {DEPOSIT_NETWORKS.map((network) => (
                  <span
                    key={network}
                    className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] text-ivory/70"
                  >
                    {network}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 text-sm text-ivory/70">
            <p className="flex items-center gap-2 font-medium text-saffron/80">
              <span className="h-2 w-2 rounded-full bg-saffron" />
              {t('emptyTitle')}
            </p>
            <p>{t('emptyBody')}</p>
            {passphraseValidation.hasValue && (
              <div className="mt-2 rounded-xl border border-lapis/30 bg-lapis/10 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.14em] text-lapis/90">{t('passphraseOfferTitle')}</p>
                <p className="mt-1 text-xs text-ivory/70">{t('passphraseOfferBody')}</p>
                <p className="mt-2 font-mono text-sm text-ivory/70">{'*'.repeat(24)}</p>
                <button
                  type="button"
                  onClick={() => void copyPassphrase()}
                  aria-describedby={clipboardStatusId}
                  className="mt-3 rounded-full border border-lapis/35 bg-lapis/15 px-3 py-1.5 text-xs font-semibold text-lapis transition hover:bg-lapis/25"
                >
                  {passphraseCopied ? t('copiedPassphrase') : t('copyPassphrase')}
                </button>
              </div>
            )}
          </div>
        )}

        {mode === 'session-only' && (
          <p className="mt-3 text-xs text-saffron/90">{t('sessionOnlyMode')}</p>
        )}
        <p id={clipboardStatusId} className="sr-only" aria-live="polite">
          {clipboardStatusMessage}
        </p>
        {notice && (
          <p id={noticeId} role="status" aria-live="polite" className="mt-3 text-xs text-saffron/90">
            {notice}
          </p>
        )}
        {error && (
          <p id={errorId} role="alert" className="mt-3 text-sm text-red-300">
            {error}
          </p>
        )}
      </div>
    </section>
  )
}
