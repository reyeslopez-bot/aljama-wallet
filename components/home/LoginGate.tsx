"use client"

import * as React from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"

type Props = {
  title?: string
  subtitle?: string
  buttonText?: string
  onUnlock?: (payload: { email: string; password: string }) => void
  showBackLink?: boolean
  backText?: string
  onBack?: () => void
}

export default function LoginGate({
  title,
  subtitle,
  buttonText,
  onUnlock,
  showBackLink = true,
  backText,
  onBack,
}: Props) {
  const t = useTranslations("auth")
  const locale = useLocale()
  const router = useRouter()

  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [inviteToken, setInviteToken] = React.useState("")
  const [showPw, setShowPw] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [mode, setMode] = React.useState<"login" | "register">("login")
  const [error, setError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)

  const isStrongPassword = (value: string) => {
    if (value.length < 12) return false
    if (!/[a-z]/.test(value)) return false
    if (!/[A-Z]/.test(value)) return false
    if (!/\d/.test(value)) return false
    if (!/[^\w\s]/.test(value)) return false
    return true
  }

  const strongPassword = isStrongPassword(password)
  const disabled =
    busy ||
    !email.trim() ||
    !password ||
    (mode === "register" && (!inviteToken.trim() || !strongPassword))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (disabled) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const normalizedEmail = email.trim()
      const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
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
          const message =
            body?.error === "Invalid invite token"
              ? t("invalidInvite")
              : t("registerFailed")
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

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-black/80 px-6 py-12">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(closest-side_at_50%_50%,rgba(210,167,98,0.12),rgba(255,255,255,0.00)_62%)]" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[720px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle_at_60%_40%,rgba(78,120,160,0.16),rgba(0,0,0,0)_60%)] blur-[20px]" />

      <div className="surface-panel panel-glow-saffron relative w-full max-w-xl rounded-[2rem] p-8">
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
            {subtitle ?? t("subtitle")}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block text-xs uppercase tracking-[0.16em] text-ivory/60">
            {t("email")}
          </label>
          <input
            className="surface-inner w-full px-4 py-3 text-base text-ivory placeholder:text-ivory/40 focus:border-saffron/50 focus:outline-none focus:ring-2 focus:ring-saffron/20"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            autoComplete="email"
            type="email"
          />

          <label className="block pt-2 text-xs uppercase tracking-[0.16em] text-ivory/60">
            {t("password")}
          </label>
          <div className="relative">
            <input
              className="surface-inner w-full px-4 py-3 pr-12 text-base text-ivory placeholder:text-ivory/40 focus:border-saffron/50 focus:outline-none focus:ring-2 focus:ring-saffron/20"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              type={showPw ? "text" : "password"}
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
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
              <label className="block pt-2 text-xs uppercase tracking-[0.16em] text-ivory/60">
                {t("invite")}
              </label>
              <input
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
            className="mt-2 w-full rounded-2xl border border-white/10 bg-gradient-to-r from-[#f0d7a0] via-[#dda469] to-[#c7794a] px-4 py-3 text-base font-semibold text-[#1c120a] shadow-lg shadow-[#c7794a]/30 transition hover:from-[#f6e1b6] hover:to-[#d48755] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={disabled}
          >
            {busy
              ? mode === "register"
                ? t("registering")
                : t("signingIn")
              : buttonText ?? (mode === "register" ? t("register") : t("signIn"))}
          </button>

          {mode === "register" && password && !strongPassword && !error && (
            <p className="text-[11px] text-ivory/50">{t("passwordRules")}</p>
          )}
          {error && <p className="text-xs text-red-300">{error}</p>}
          {notice && <p className="text-xs text-jade">{notice}</p>}

          <button
            type="button"
            onClick={() => setMode((prev) => (prev === "login" ? "register" : "login"))}
            className="text-xs uppercase tracking-[0.18em] text-ivory/60 transition hover:text-saffron"
          >
            {mode === "login" ? t("toggleToRegister") : t("toggleToLogin")}
          </button>

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
