"use client"

import * as React from "react"
import { signIn, useSession } from "next-auth/react"
import { usePathname, useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { hasRecognizedDevice } from "@/infra/telemetry/client"

type Props = {
  title?: string
  subtitle?: string
  buttonText?: string
  initialMode?: "login" | "register"
  onUnlock?: (payload: { email: string; password: string }) => void
  showBackLink?: boolean
  showCloseButton?: boolean
  backText?: string
  onBack?: () => void
  onClose?: () => void
}

export default function LoginGate({
  title,
  subtitle,
  buttonText,
  initialMode = "login",
  onUnlock,
  showBackLink = true,
  showCloseButton = !showBackLink,
  backText,
  onBack,
  onClose,
}: Props) {
  const t = useTranslations("auth")
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const { status: sessionStatus } = useSession()

  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [inviteToken, setInviteToken] = React.useState("")
  const [showPw, setShowPw] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [mode, setMode] = React.useState<"login" | "register">(initialMode)
  const [error, setError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [recognizedDevice, setRecognizedDevice] = React.useState(false)

  const isStrongPassword = (value: string) => {
    if (value.length < 12) return false
    if (!/[a-z]/.test(value)) return false
    if (!/[A-Z]/.test(value)) return false
    if (!/\d/.test(value)) return false
    if (!/[^\w\s]/.test(value)) return false
    return true
  }

  const strongPassword = isStrongPassword(password)
  const normalizedEmail = email.trim()
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
  const disabled =
    busy ||
    !normalizedEmail ||
    !password ||
    !isValidEmail ||
    (mode === "register" && (!inviteToken.trim() || !strongPassword))
  const emailFieldId = "secure-gate-email"
  const passwordFieldId = "secure-gate-password"
  const inviteFieldId = "secure-gate-invite"

  React.useEffect(() => {
    if (sessionStatus !== "authenticated") return
    router.replace(`/${locale}`)
  }, [locale, router, sessionStatus])

  React.useEffect(() => {
    setMode(initialMode)
  }, [initialMode])

  React.useEffect(() => {
    setRecognizedDevice(hasRecognizedDevice())
  }, [])

  React.useEffect(() => {
    if (typeof window === "undefined") return
    const hasExplicitMode = new URLSearchParams(window.location.search).has("mode")
    if (hasExplicitMode) return
    setMode(hasRecognizedDevice() ? "login" : "register")
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (disabled) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      if (!isValidEmail) {
        setError(t("emailInvalid"))
        return
      }

      if (mode === "register" && !strongPassword) {
        setError(t("passwordWeak"))
        return
      }

      if (onUnlock) {
        onUnlock({ email: normalizedEmail, password })
        return
      }

      if (mode === "register") {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email: normalizedEmail,
            password,
            inviteToken: inviteToken.trim(),
          }),
        })

        if (!res.ok) {
          const body = await res.json().catch(() => null)
          let message = t("registerFailed")
          if (body?.error === "Invalid invite token") {
            message = t("invalidInvite")
          } else if (body?.error === "User already exists") {
            message = t("emailExists")
          } else if (typeof body?.error === "string") {
            message = body.error
          }
          setError(message)
          return
        }

        setNotice(t("registerSuccess"))
      }

      const result = await signIn("credentials", {
        email: normalizedEmail,
        password,
        redirect: false,
      })

      if (!result || result.error) {
        setError(t("loginFailed"))
        return
      }

      router.push(`/${locale}`)
    } finally {
      setBusy(false)
    }
  }

  const LANGUAGES = [
    { label: "EN", value: "en" },
    { label: "HE", value: "he" },
    { label: "AR", value: "ar" },
  ]
  const resolvedSubtitle = subtitle ?? (mode === "register" ? t("subtitleRegister") : t("subtitle"))

  return (
    <div
      data-testid="secure-gate-root"
      className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-black/80 px-6 py-12"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(closest-side_at_50%_50%,rgba(210,167,98,0.12),rgba(255,255,255,0.00)_62%)]" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[720px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle_at_60%_40%,rgba(78,120,160,0.16),rgba(0,0,0,0)_60%)] blur-[20px]" />

      <div
        data-testid="secure-gate-panel"
        className="surface-panel panel-glow-saffron relative w-full max-w-xl rounded-[2rem] p-8"
      >
        {showCloseButton && (
          <button
            type="button"
            onClick={() => {
              if (onClose) {
                onClose()
                return
              }
              router.push(`/${locale}`)
            }}
            className="absolute left-6 top-6 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-ivory/70 transition hover:border-white/20 hover:bg-white/10 hover:text-ivory"
            aria-label={t("back")}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path
                d="M3 3l8 8M11 3l-8 8"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </button>
        )}
        <div className="absolute right-6 top-6 z-10 flex items-center gap-2">
          {LANGUAGES.map((language) => (
            <button
              key={language.value}
              type="button"
              onClick={() => {
                const segments = pathname.split('/')
                if (segments.length > 1) {
                  segments[1] = language.value
                } else {
                  segments.push(language.value)
                }
                router.push(segments.join('/') || `/${language.value}`)
              }}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-[0.16em] transition ${
                locale === language.value
                  ? 'border-saffron/60 bg-saffron/10 text-saffron'
                  : 'border-white/10 bg-white/5 text-ivory/60 hover:border-white/20'
              }`}
            >
              {language.label}
            </button>
          ))}
        </div>
        <div className="absolute inset-x-10 top-6 ornament-line" />
        <div className="text-center">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-white/5">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M12 2l8 4v6c0 5-3.2 9.7-8 10-4.8-.3-8-5-8-10V6l8-4z"
                stroke="rgba(255,255,255,0.9)"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h2 className="font-display text-3xl font-semibold tracking-tight text-ivory sm:text-4xl">
            {title ?? t("title")}
          </h2>
          <p className="mt-2 text-sm text-ivory/70">
            {resolvedSubtitle}
          </p>
          {mode === "register" && !recognizedDevice ? (
            <p className="mt-1 text-xs text-saffron/80">{t("inviteRequired")}</p>
          ) : null}
        </div>

        <form data-testid="secure-gate-form" onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label htmlFor={emailFieldId} className="block text-xs uppercase tracking-[0.16em] text-ivory/60">
            {t("email")}
          </label>
          <input
            id={emailFieldId}
            name="secure_gate_email"
            data-testid="secure-gate-email-input"
            className="surface-inner w-full px-4 py-3 text-base text-ivory placeholder:text-ivory/40 focus:border-saffron/50 focus:outline-none focus:ring-2 focus:ring-saffron/20"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            autoComplete="email"
            type="email"
          />
          {email && !isValidEmail && (
            <p className="text-[11px] text-saffron/80">{t("emailInvalid")}</p>
          )}

          <label htmlFor={passwordFieldId} className="block pt-2 text-xs uppercase tracking-[0.16em] text-ivory/60">
            {t("password")}
          </label>
          <div className="relative">
            <input
              id={passwordFieldId}
              name="secure_gate_password"
              data-testid="secure-gate-password-input"
              className="surface-inner w-full px-4 py-3 pr-12 text-base text-ivory placeholder:text-ivory/40 focus:border-saffron/50 focus:outline-none focus:ring-2 focus:ring-saffron/20"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              type={showPw ? "text" : "password"}
              autoComplete={mode === "register" ? "new-password" : "current-password"}
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              data-testid="secure-gate-password-visibility"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-xl border border-white/10 bg-white/5 p-2 text-ivory/70 transition hover:bg-white/10"
              aria-label={showPw ? "Hide password" : "Show password"}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path
                  d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"
                  stroke="rgba(255,255,255,0.75)"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
                <path
                  d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"
                  stroke="rgba(255,255,255,0.75)"
                  strokeWidth="1.6"
                />
              </svg>
            </button>
          </div>

          {mode === "register" && (
            <>
              <label htmlFor={inviteFieldId} className="block pt-2 text-xs uppercase tracking-[0.16em] text-ivory/60">
                {t("invite")}
              </label>
              <input
                id={inviteFieldId}
                name="secure_gate_invite_token"
                data-testid="secure-gate-invite-input"
                className="surface-inner w-full px-4 py-3 text-base text-ivory placeholder:text-ivory/40 focus:border-saffron/50 focus:outline-none focus:ring-2 focus:ring-saffron/20"
                value={inviteToken}
                onChange={(e) => setInviteToken(e.target.value)}
                placeholder="demo-invite"
              />
              <p className="text-[11px] text-ivory/50">{t("inviteHint")}</p>
            </>
          )}

          <button
            type="submit"
            data-testid="secure-gate-auth-submit"
            className="mt-2 w-full rounded-2xl border border-white/10 bg-gradient-to-r from-[#f0d7a0] via-[#dda469] to-[#c7794a] px-4 py-3 text-base font-semibold text-ivory shadow-lg shadow-[#c7794a]/30 transition hover:from-[#f6e1b6] hover:to-[#d48755] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={disabled}
          >
            {busy
              ? mode === "register"
                ? t("registering")
                : t("signingIn")
              : buttonText ?? (mode === "register" ? t("register") : t("signIn"))}
          </button>

          {mode === "register" && (
            <p className={`text-[11px] ${strongPassword ? 'text-ivory/50' : 'text-saffron/80'}`}>
              {t("passwordRules")}
            </p>
          )}
          {error && <p className="text-xs text-red-300">{error}</p>}
          {notice && <p className="text-xs text-jade">{notice}</p>}

          <div data-testid="secure-gate-auth-mode-switch" className="text-center text-xs text-ivory/62">
            <span>{mode === "register" ? t("alreadyHaveAccount") : t("needAccount")}</span>
            {' '}
            <button
              type="button"
              onClick={() => {
                setMode((prev) => (prev === "login" ? "register" : "login"))
                setError(null)
                setNotice(null)
              }}
              className="font-semibold uppercase tracking-[0.12em] text-saffron transition hover:text-ivory"
            >
              {mode === "register" ? t("signIn") : t("register")}
            </button>
          </div>

          {showBackLink && (
            <div className="pt-2 text-center">
              <button
                type="button"
                className="text-xs uppercase tracking-[0.18em] text-ivory/60 transition hover:text-saffron"
                onClick={onBack}
              >
                {backText ?? t("back")}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
