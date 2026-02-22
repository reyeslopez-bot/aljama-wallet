'use client'

import type { ClipboardEvent, FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useDynamicInfoStore } from '@/hooks/useDynamicInfoStore'
import { clearWalletId, persistEncryptedSession } from '@/lib/storage/walletSession'
import {
  DEFAULT_BIP44_PATH,
  encodeWalletToEncrypted,
  generateMnemonicWallet,
  type MnemonicWalletMaterial,
} from '@/lib/wallet'
import { useComponentTelemetry } from '@/infra/telemetry/useComponentTelemetry'
import { useTranslations } from 'next-intl'
import { useSession } from 'next-auth/react'
import { buildOnRampUrl, isUsingDefaultOnRampTemplate } from '@/lib/payment/onramp'
import UnlockActionsLink from '@/components/ui/UnlockActionsLink.client'

type WalletPreview = {
  address: string
  derivationPath: string
  wordCount: number
}

type KeystoreFile = {
  address: string
  encrypted: string
  derivationPath: string
  wordCount: number
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
        derivation: {
          standard: 'BIP-39/BIP-44',
          path: payload.derivationPath,
          wordCount: payload.wordCount,
        },
      },
      encryption: {
        algorithm: 'AES-256-GCM',
        kdf: 'PBKDF2',
      },
      encrypted: payload.encrypted,
    },
    null,
    2,
  )
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
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [mode, setMode] = useState<'custody' | 'session-only' | null>(null)
  const [walletPreview, setWalletPreview] = useState<WalletPreview | null>(null)
  const [walletDraft, setWalletDraft] = useState<MnemonicWalletMaterial | null>(null)
  const [recoveryWordSlots, setRecoveryWordSlots] = useState<number[]>([])
  const [recoveryWords, setRecoveryWords] = useState<Record<number, string>>({})
  const [recoveryBackedUp, setRecoveryBackedUp] = useState(false)
  const [recoveryLossAccepted, setRecoveryLossAccepted] = useState(false)
  const [keystoreFile, setKeystoreFile] = useState<KeystoreFile | null>(null)
  const [addressCopied, setAddressCopied] = useState(false)
  const [keystoreDownloaded, setKeystoreDownloaded] = useState(false)
  const setCreateWalletStatus = useDynamicInfoStore((s) => s.setCreateWalletStatus)
  const setCreatedWalletAddress = useDynamicInfoStore((s) => s.setCreatedWalletAddress)

  const passphraseValidation = useMemo(() => evaluatePassphrase(password), [password])
  const onRampTemplate = process.env.NEXT_PUBLIC_ONRAMP_URL_TEMPLATE
  const usingDefaultOnRamp = isUsingDefaultOnRampTemplate(onRampTemplate)
  const onRampUrl = walletPreview ? buildOnRampUrl(walletPreview.address, onRampTemplate) : undefined
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

  useEffect(() => {
    if (!addressCopied) return
    const timeout = window.setTimeout(() => setAddressCopied(false), 1800)
    return () => window.clearTimeout(timeout)
  }, [addressCopied])

  useEffect(() => {
    if (!keystoreDownloaded) return
    const timeout = window.setTimeout(() => setKeystoreDownloaded(false), 1800)
    return () => window.clearTimeout(timeout)
  }, [keystoreDownloaded])

  const copyAddress = async () => {
    if (!walletPreview) return
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return
    try {
      await navigator.clipboard.writeText(walletPreview.address)
      setAddressCopied(true)
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

  const beginRecoveryStep = () => {
    const nextDraft = generateMnemonicWallet({
      mnemonicPassphrase: useOptionalMnemonicPassphrase ? mnemonicPassphrase.trim() : '',
      wordCount: 24,
      derivationPath: DEFAULT_BIP44_PATH,
    })

    const recoverySlots = buildRecoveryWordSlots(nextDraft.wordCount)
    setWalletDraft(nextDraft)
    setRecoveryWordSlots(recoverySlots)
    setRecoveryWords({})
    setRecoveryBackedUp(false)
    setRecoveryLossAccepted(false)
    setStatus('idle')
    setNotice(t('verifyPrompt'))
    setCreateWalletStatus('idle')
  }

  const finalizeWallet = async (draft: MnemonicWalletMaterial) => {
    const encrypted = await encodeWalletToEncrypted(
      {
        address: draft.address,
        privateKey: draft.privateKey,
      },
      password.trim(),
    )

    persistEncryptedSession(encrypted)
    clearWalletId()

    setWalletPreview({
      address: draft.address,
      derivationPath: draft.derivationPath,
      wordCount: draft.wordCount,
    })
    setKeystoreFile({
      address: draft.address,
      encrypted,
      derivationPath: draft.derivationPath,
      wordCount: draft.wordCount,
    })

    setMode('session-only')
    setStatus('success')
    setNotice(t('localOnlyNotice'))
    setCreateWalletStatus('success')
    setCreatedWalletAddress(draft.address)
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

      setCreateWalletStatus('pending')
      await finalizeWallet(walletDraft)
    } catch (err) {
      console.error('Wallet creation failed', err)
      const message = err instanceof Error ? err.message : t('createFailed')
      setError(message)
      setStatus('error')
      setCreateWalletStatus('error', message)
    }
  }

  const badgeColor = status === 'success' ? 'bg-jade/20 text-jade' : 'bg-white/5 text-ivory/70'

  return (
    <section className="surface-panel panel-glow-saffron relative p-7 sm:p-8">
      <div className="absolute inset-x-8 top-5 ornament-line" />

      <header className="relative flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-saffron/70">{t('eyebrow')}</p>
          <h2 className="mt-3 font-display text-2xl font-semibold text-ivory sm:text-3xl">{t('title')}</h2>
          <p className="text-sm text-ivory/70">{t('body')}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold tracking-wide ${badgeColor}`}>
          {status === 'success' ? t('badgeReady') : t('badgeCustody')}
        </span>
      </header>

      <form onSubmit={submit} className="relative mt-6 space-y-4">
        <label className="block text-xs uppercase tracking-[0.16em] text-ivory/60">{t('passwordLabel')}</label>

        <div className="space-y-3">
          <div className="surface-inner flex w-full items-center gap-3 px-4 py-3 focus-within:border-saffron/50 focus-within:ring-2 focus-within:ring-saffron/25">
            <span className="text-xs uppercase tracking-[0.2em] text-saffron/70">{t('passwordTag')}</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onCopy={preventSensitiveCopy}
              onCut={preventSensitiveCopy}
              placeholder={t('passwordPlaceholder')}
              disabled={locked || status === 'pending'}
              className="w-full bg-transparent text-base text-ivory placeholder:text-ivory/40 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>

          <div className="surface-inner flex w-full items-center gap-3 px-4 py-3 focus-within:border-lapis/50 focus-within:ring-2 focus-within:ring-lapis/25">
            <div className="flex-1">
              <p className="text-xs uppercase tracking-[0.2em] text-lapis/75">{t('mnemonicToggleLabel')}</p>
              <p className="mt-1 text-[11px] text-ivory/55">{t('mnemonicToggleHint')}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={useOptionalMnemonicPassphrase}
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
                className={`absolute top-0.5 h-[22px] w-[22px] rounded-full bg-white transition ${
                  useOptionalMnemonicPassphrase ? 'left-6 bg-lapis' : 'left-0.5'
                }`}
              />
            </button>
          </div>

          {useOptionalMnemonicPassphrase && (
            <>
              <div className="surface-inner flex w-full items-center gap-3 px-4 py-3 focus-within:border-lapis/50 focus-within:ring-2 focus-within:ring-lapis/25">
                <span className="text-xs uppercase tracking-[0.2em] text-lapis/75">{t('mnemonicPassphraseTag')}</span>
                <input
                  type="password"
                  value={mnemonicPassphrase}
                  onChange={(event) => setMnemonicPassphrase(event.target.value)}
                  onCopy={preventSensitiveCopy}
                  onCut={preventSensitiveCopy}
                  placeholder={t('mnemonicPassphrasePlaceholder')}
                  disabled={locked || status === 'pending'}
                  className="w-full bg-transparent text-base text-ivory placeholder:text-ivory/40 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>
              <p className="text-xs text-ivory/55">{t('mnemonicPassphraseHint')}</p>
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

        {showUnlockMessage && <UnlockActionsLink className="text-xs uppercase tracking-[0.18em] text-ivory/50" />}

        {passphraseValidation.hasValue && (
          <div className="surface-inner relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#121820] via-[#0d1118] to-[#16120f] p-4">
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
              <div className="rounded-full border border-white/10 bg-black/35 p-1">
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
          <div className="surface-inner space-y-4 rounded-2xl border border-saffron/25 bg-black/25 p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-saffron/75">{t('mnemonicTitle')}</p>

            <p className="text-xs text-ivory/65">{t('mnemonicHint')}</p>
            <div
              className="grid gap-2 sm:grid-cols-2 select-none"
              onCopy={preventSensitiveCopy}
              onCut={preventSensitiveCopy}
            >
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
                    type="text"
                    autoComplete="off"
                    value={recoveryWords[slot] ?? ''}
                    onChange={(event) => {
                      setRecoveryWords((prev) => ({
                        ...prev,
                        [slot]: event.target.value,
                      }))
                    }}
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

      <div className="surface-inner relative mt-6 p-4">
        {walletPreview ? (
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.16em] text-jade/80">{t('readyTitle')}</p>
            <p className="text-sm text-ivory/70">{t('readyBody')}</p>
            <div className="rounded-xl border border-jade/30 bg-jade/10 px-4 py-3 text-sm text-jade">
              <p className="text-xs uppercase tracking-[0.14em] text-jade/80">{t('addressLabel')}</p>
              <p className="mt-1 break-all font-mono text-base">{walletPreview.address}</p>
              <p className="mt-2 text-[11px] text-jade/80">
                {t('derivationLabel')}: <span className="font-mono">{walletPreview.derivationPath}</span>
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void copyAddress()}
                  className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-ivory transition hover:bg-white/15"
                >
                  {addressCopied ? t('copiedAddress') : t('copyAddress')}
                </button>
                <button
                  type="button"
                  onClick={downloadKeystore}
                  className="rounded-full border border-lapis/30 bg-lapis/10 px-3 py-1.5 text-xs font-semibold text-lapis transition hover:bg-lapis/20"
                >
                  {keystoreDownloaded ? t('keystoreDownloaded') : t('downloadKeystore')}
                </button>
                <a
                  href={onRampUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-saffron/30 bg-saffron/10 px-3 py-1.5 text-xs font-semibold text-saffron transition hover:bg-saffron/20"
                >
                  {t('buyWithCard')}
                </a>
              </div>
              {usingDefaultOnRamp && <p className="mt-2 text-[11px] text-ivory/55">{t('buyWithCardDisabled')}</p>}
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
                <p className="mt-3 text-xs text-ivory/60">{t('passphraseNoCopy')}</p>
              </div>
            )}
          </div>
        )}

        {mode === 'session-only' && (
          <p className="mt-3 text-xs text-saffron/90">{t('sessionOnlyMode')}</p>
        )}
        {notice && <p className="mt-3 text-xs text-saffron/90">{notice}</p>}
        {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
      </div>
    </section>
  )
}
