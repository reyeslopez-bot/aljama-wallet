"use client"

import * as React from "react"
import Image from "next/image"
import { signIn } from "next-auth/react"
import { usePathname, useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { hasRecognizedDevice } from "@/infra/telemetry/client"
import { parseClientApiError } from "@/lib/security/client-api-error"
import { logWarn } from "@/lib/security/logging"
import { persistProfileImageForUsername } from "@/lib/storage/profileImage"
import InteractiveShell from "@/components/system/InteractiveShell.client"

type Props = {
  title?: string
  subtitle?: string
  buttonText?: string
  initialMode?: "login" | "register"
  variant?: "page" | "inline"
  onUnlock?: (payload: { identifier: string; password: string }) => void
  showBackLink?: boolean
  showCloseButton?: boolean
  backText?: string
  onBack?: () => void
  onClose?: () => void
}

const MAX_PROFILE_IMAGE_BYTES = 1024 * 1024
const PROFILE_IMAGE_MAX_DIMENSION = 512
const PROFILE_IMAGE_OUTPUT_TYPE = "image/webp"
const PROFILE_IMAGE_QUALITY_STEPS = [0.9, 0.82, 0.74, 0.66]
const PROFILE_IMAGE_SCALE_STEPS = [1, 0.85, 0.7, 0.55]

function estimateDataUrlBytes(dataUrl: string) {
  const [, payload = ""] = dataUrl.split(",", 2)
  const paddingLength = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0
  return Math.max(0, Math.floor((payload.length * 3) / 4) - paddingLength)
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("invalid_profile_image"))
        return
      }
      resolve(reader.result)
    }
    reader.onerror = () => reject(new Error("invalid_profile_image"))
    reader.readAsDataURL(file)
  })
}

function loadImageFromSrc(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error("invalid_profile_image"))
    image.src = src
  })
}

async function optimizeProfileImage(file: File): Promise<string> {
  const sourceDataUrl = await readFileAsDataUrl(file)
  if (estimateDataUrlBytes(sourceDataUrl) <= MAX_PROFILE_IMAGE_BYTES) {
    return sourceDataUrl
  }

  const image = await loadImageFromSrc(sourceDataUrl)
  const sourceWidth = Math.max(1, image.naturalWidth || image.width)
  const sourceHeight = Math.max(1, image.naturalHeight || image.height)
  const longestEdge = Math.max(sourceWidth, sourceHeight)
  const baseScale = Math.min(1, PROFILE_IMAGE_MAX_DIMENSION / longestEdge)
  const canvas = document.createElement("canvas")
  const context = canvas.getContext("2d")

  if (!context) {
    throw new Error("invalid_profile_image")
  }

  for (const scaleStep of PROFILE_IMAGE_SCALE_STEPS) {
    const targetScale = Math.min(1, baseScale * scaleStep)
    canvas.width = Math.max(1, Math.round(sourceWidth * targetScale))
    canvas.height = Math.max(1, Math.round(sourceHeight * targetScale))
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)

    for (const quality of PROFILE_IMAGE_QUALITY_STEPS) {
      const optimizedDataUrl = canvas.toDataURL(PROFILE_IMAGE_OUTPUT_TYPE, quality)
      if (estimateDataUrlBytes(optimizedDataUrl) <= MAX_PROFILE_IMAGE_BYTES) {
        return optimizedDataUrl
      }
    }
  }

  throw new Error("profile_image_too_large")
}

export default function LoginGate({
  title,
  subtitle,
  buttonText,
  initialMode = "login",
  variant = "page",
  onUnlock,
  showBackLink = true,
  showCloseButton = !showBackLink,
  backText,
  onBack,
  onClose,
}: Props) {
  const t = useTranslations("auth")
  const tCommon = useTranslations("common")
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()

  const [identifier, setIdentifier] = React.useState("")
  const [username, setUsername] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [profileImage, setProfileImage] = React.useState<string | null>(null)
  const [profileImageBusy, setProfileImageBusy] = React.useState(false)
  const [showPw, setShowPw] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [mode, setMode] = React.useState<"login" | "register">(initialMode)
  const [error, setError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [retryDeadlineMs, setRetryDeadlineMs] = React.useState<number | null>(null)
  const [retryCountdownSeconds, setRetryCountdownSeconds] = React.useState(0)
  const profileImageSelectionIdRef = React.useRef(0)

  const isStrongPassword = (value: string) => {
    if (value.length < 12) return false
    if (!/[a-z]/.test(value)) return false
    if (!/[A-Z]/.test(value)) return false
    if (!/\d/.test(value)) return false
    if (!/[^\w\s]/.test(value)) return false
    return true
  }

  const strongPassword = isStrongPassword(password)
  const normalizedIdentifier = identifier.trim().toLowerCase()
  const normalizedUsername = username.trim().toLowerCase()
  const normalizedEmail = email.trim().toLowerCase()
  const hasRegisterEmail = normalizedEmail.length > 0
  const isValidRegisterEmail = !hasRegisterEmail || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
  const isValidUsername = /^[a-zA-Z0-9][a-zA-Z0-9._-]{2,31}$/.test(normalizedUsername)
  const disabled =
    busy ||
    profileImageBusy ||
    retryCountdownSeconds > 0 ||
    !password ||
    (mode === "register"
      ? (!normalizedUsername || !isValidUsername || !strongPassword || !isValidRegisterEmail)
      : !normalizedIdentifier)
  const identifierFieldId = "secure-gate-identifier"
  const usernameFieldId = "secure-gate-username"
  const emailFieldId = "secure-gate-email"
  const passwordFieldId = "secure-gate-password"
  const profileImageFieldId = "secure-gate-profile-image"

  React.useEffect(() => {
    setMode(initialMode)
    setRetryDeadlineMs(null)
    setRetryCountdownSeconds(0)
  }, [initialMode])

  React.useEffect(() => {
    if (typeof window === "undefined") return
    const hasExplicitMode = new URLSearchParams(window.location.search).has("mode")
    if (hasExplicitMode) return
    setMode(hasRecognizedDevice() ? "login" : "register")
  }, [])

  React.useEffect(() => {
    if (!retryDeadlineMs) {
      setRetryCountdownSeconds(0)
      return
    }

    const syncCountdown = () => {
      const remainingSeconds = Math.max(0, Math.ceil((retryDeadlineMs - Date.now()) / 1000))
      setRetryCountdownSeconds(remainingSeconds)
      if (remainingSeconds === 0) {
        setRetryDeadlineMs(null)
      }
    }

    syncCountdown()
    const intervalId = window.setInterval(syncCountdown, 250)
    return () => window.clearInterval(intervalId)
  }, [retryDeadlineMs])

  const formatRegisterApiError = React.useCallback(
    (apiError: ReturnType<typeof parseClientApiError>, body: { error?: string } | null) => {
      if (apiError.code === "email_exists" || apiError.code === "user_exists" || body?.error === "User already exists") {
        return t("emailExists")
      }
      if (apiError.code === "username_exists") {
        return t("usernameExists")
      }
      if (apiError.code === "rate_limited") {
        return apiError.retryAfterSeconds
          ? t("rateLimitedRetryAfter", { seconds: String(apiError.retryAfterSeconds) })
          : t("rateLimited")
      }
      if (apiError.code === "rate_limit_backend_unavailable") {
        return apiError.retryAfterSeconds
          ? t("registerServiceUnavailableRetryAfter", {
              seconds: String(apiError.retryAfterSeconds),
            })
          : t("registerServiceUnavailable")
      }
      if (apiError.code === "invalid_email") {
        return t("emailInvalid")
      }
      if (apiError.code === "invalid_profile_image") {
        return t("profileImageInvalid")
      }
      if (apiError.code === "profile_image_gif_unsupported") {
        return t("profileImageGifUnsupported")
      }
      if (apiError.code === "profile_image_too_large") {
        return t("profileImageTooLarge")
      }
      return apiError.rawMessage || t("registerFailed")
    },
    [t],
  )

  const navigateHome = React.useCallback(
    (method: "push" | "replace", reason: string) => {
      const fallbackHref = `/${locale}`
      const navigateWindow = () => {
        if (typeof window === "undefined") return
        const targetUrl = new URL(fallbackHref, window.location.origin).toString()
        const isJsDom = /jsdom/i.test(window.navigator.userAgent)
        if (isJsDom) return
        if (method === "replace") {
          window.location.replace(targetUrl)
          return
        }
        window.location.assign(targetUrl)
      }

      try {
        if (method === "replace") {
          router.replace(fallbackHref)
        } else {
          router.push(fallbackHref)
        }
      } catch (error) {
        logWarn("login-gate:navigate", error, {
          fallbackHref,
          pathname,
          mode,
          method,
          reason,
        })
        navigateWindow()
        return
      }

      if (typeof window !== "undefined") {
        const isJsDom = /jsdom/i.test(window.navigator.userAgent)
        if (isJsDom) return

        window.setTimeout(() => {
          if (window.location.pathname.includes("/login")) {
            navigateWindow()
          }
        }, 64)
      }
    },
    [locale, mode, pathname, router],
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (disabled) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      if (mode !== "register" && !normalizedIdentifier) {
        setError(t("identifierRequired"))
        return
      }

      if (onUnlock) {
        onUnlock({
          identifier: mode === "register" ? normalizedUsername : normalizedIdentifier,
          password,
        })
        return
      }

      if (mode === "register") {
        if (!normalizedUsername) {
          setError(t("usernameRequired"))
          return
        }

        if (!isValidUsername) {
          setError(t("usernameInvalid"))
          return
        }

        if (!isValidRegisterEmail) {
          setError(t("emailInvalid"))
          return
        }

        if (!strongPassword) {
          setError(t("passwordWeak"))
          return
        }

        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            username: normalizedUsername,
            email: normalizedEmail || null,
            password,
            image: profileImage,
          }),
        })

        const body = (await res.json().catch(() => null)) as { error?: string; user?: { username?: string } } | null

        if (!res.ok) {
          const apiError = parseClientApiError(res, body)
          setRetryDeadlineMs(
            apiError.retryAfterSeconds ? Date.now() + apiError.retryAfterSeconds * 1_000 : null,
          )
          setError(formatRegisterApiError(apiError, body))
          return
        }

        setRetryDeadlineMs(null)

        if (profileImage) {
          const persistedUsername =
            typeof body?.user?.username === "string" && body.user.username.trim()
              ? body.user.username.trim()
              : normalizedUsername
          persistProfileImageForUsername(persistedUsername, profileImage)
        }

      }

      const authIdentifier = mode === "register" ? normalizedUsername : normalizedIdentifier
      const result = await signIn("credentials", {
        identifier: authIdentifier,
        password,
        redirect: false,
      })

      if (!result || result.error) {
        setRetryDeadlineMs(null)
        setError(t("loginFailed"))
        return
      }

      setRetryDeadlineMs(null)
      navigateHome("push", "auth_success")
    } catch (error) {
      logWarn("login-gate:submit", error, {
        pathname,
        mode,
        identifier: mode === "register" ? normalizedUsername : normalizedIdentifier,
      })

      setRetryDeadlineMs(null)
      if (mode === "register") {
        setError(t("registerServiceUnavailable"))
      } else {
        setError(t("loginServiceUnavailable"))
      }
    } finally {
      setBusy(false)
    }
  }

  const resolvedSubtitle = subtitle ?? (mode === "register" ? t("subtitleRegister") : t("subtitle"))
  const submitLabel = busy
    ? mode === "register"
      ? t("registering")
      : t("signingIn")
    : retryCountdownSeconds > 0
      ? t("retryInButton", { seconds: String(retryCountdownSeconds) })
      : buttonText ?? (mode === "register" ? t("register") : t("signIn"))

  const handleProfileImageChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.target
    const selectionId = ++profileImageSelectionIdRef.current
    const file = input.files?.[0]
    if (!file) {
      setProfileImageBusy(false)
      setProfileImage(null)
      return
    }

    if (!file.type.startsWith("image/")) {
      setProfileImageBusy(false)
      setError(t("profileImageInvalid"))
      setProfileImage(null)
      return
    }

    if (file.type === "image/gif") {
      setProfileImageBusy(false)
      setError(t("profileImageGifUnsupported"))
      setProfileImage(null)
      input.value = ""
      return
    }

    setProfileImageBusy(true)
    setError(null)

    try {
      const nextProfileImage =
        file.size > MAX_PROFILE_IMAGE_BYTES ? await optimizeProfileImage(file) : await readFileAsDataUrl(file)

      if (profileImageSelectionIdRef.current !== selectionId) {
        return
      }

      setProfileImage(nextProfileImage)
    } catch (uploadError) {
      if (profileImageSelectionIdRef.current !== selectionId) {
        return
      }

      const message = uploadError instanceof Error ? uploadError.message : "invalid_profile_image"
      setError(message === "profile_image_too_large" ? t("profileImageTooLarge") : t("profileImageInvalid"))
      setProfileImage(null)
      input.value = ""
    } finally {
      if (profileImageSelectionIdRef.current === selectionId) {
        setProfileImageBusy(false)
      }
    }
  }

  const handleCloseGate = React.useCallback(() => {
    if (onClose) {
      onClose()
      return
    }

    navigateHome("replace", "close_gate")
  }, [navigateHome, onClose])

  const isInline = variant === "inline"

  return (
    <InteractiveShell
      rootTestId="secure-gate-root"
      loadingTestId="secure-gate-interactive-loading"
      loadingTitle={t("interactiveTitle")}
      loadingHint={t("interactiveHint")}
      className={
        isInline
          ? "relative flex w-full items-center justify-center overflow-hidden"
          : "relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-black/80 px-6 py-12"
      }
      overlayClassName={
        isInline
          ? "absolute inset-0 z-20 rounded-[2rem] bg-[#071018]/22 backdrop-blur-[2px]"
          : "absolute inset-0 z-20 bg-black/18 backdrop-blur-[2px]"
      }
      panelClassName="ml-auto mt-4 mr-4 max-w-xs rounded-[1.5rem] border border-white/10 bg-[#071018]/92 px-4 py-3 text-left shadow-xl shadow-black/25"
    >
      {!isInline ? (
        <>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(closest-side_at_50%_50%,rgba(210,167,98,0.12),rgba(255,255,255,0.00)_62%)]" />
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-[720px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle_at_60%_40%,rgba(78,120,160,0.16),rgba(0,0,0,0)_60%)] blur-[20px]" />
        </>
      ) : null}

      <div
        id="secure-gate"
        data-testid="secure-gate-panel"
        className={`surface-panel panel-glow-saffron relative w-full rounded-[2rem] ${
          isInline ? "max-w-3xl p-6 sm:p-8" : "max-w-xl p-8"
        }`}
      >
        {showCloseButton && (
          <button
            type="button"
            onClick={handleCloseGate}
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
        </div>

        <form data-testid="secure-gate-form" onSubmit={handleSubmit} className="mt-6 space-y-4">
          {mode === "register" ? (
            <>
              <label htmlFor={usernameFieldId} className="block text-xs uppercase tracking-[0.16em] text-ivory/60">
                {t("username")}
              </label>
              <input
                id={usernameFieldId}
                name="secure_gate_username"
                data-testid="secure-gate-username-input"
                className="surface-inner w-full px-4 py-3 text-base text-ivory placeholder:text-ivory/40 focus:border-saffron/50 focus:outline-none focus:ring-2 focus:ring-saffron/20"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="wallet_operator"
                autoComplete="username"
                type="text"
              />
              {username && !isValidUsername && (
                <p className="text-[11px] text-saffron/80">{t("usernameInvalid")}</p>
              )}

              <label htmlFor={emailFieldId} className="block pt-2 text-xs uppercase tracking-[0.16em] text-ivory/60">
                {t("email")} ({tCommon("optional")})
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
              {hasRegisterEmail && !isValidRegisterEmail && (
                <p className="text-[11px] text-saffron/80">{t("emailInvalid")}</p>
              )}
            </>
          ) : (
            <>
              <label htmlFor={identifierFieldId} className="block text-xs uppercase tracking-[0.16em] text-ivory/60">
                {t("identifier")}
              </label>
              <input
                id={identifierFieldId}
                name="secure_gate_identifier"
                data-testid="secure-gate-identifier-input"
                className="surface-inner w-full px-4 py-3 text-base text-ivory placeholder:text-ivory/40 focus:border-saffron/50 focus:outline-none focus:ring-2 focus:ring-saffron/20"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="username or you@company.com"
                autoComplete="username"
                type="text"
              />
            </>
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
              <label htmlFor={profileImageFieldId} className="block pt-2 text-xs uppercase tracking-[0.16em] text-ivory/60">
                {t("profileImage")} ({tCommon("optional")})
              </label>
              <input
                id={profileImageFieldId}
                name="secure_gate_profile_image"
                data-testid="secure-gate-profile-image-input"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleProfileImageChange}
                className="surface-inner w-full cursor-pointer px-4 py-3 text-sm text-ivory file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-ivory hover:file:bg-white/15"
              />
              <p className="text-[11px] text-ivory/50">{t("profileImageHint")}</p>
              {profileImage ? (
                <div className="surface-inner inline-flex items-center gap-3 px-3 py-2">
                  <Image
                    src={profileImage}
                    alt={t("profileImagePreviewAlt")}
                    width={40}
                    height={40}
                    unoptimized
                    className="h-10 w-10 rounded-full border border-white/15 object-cover"
                  />
                  <span className="text-xs text-ivory/70">{t("profileImageReady")}</span>
                </div>
              ) : null}

            </>
          )}

          <button
            type="submit"
            data-testid="secure-gate-auth-submit"
            className="mt-2 w-full rounded-2xl border border-white/10 bg-gradient-to-r from-[#f0d7a0] via-[#dda469] to-[#c7794a] px-4 py-3 text-base font-semibold text-ivory shadow-lg shadow-[#c7794a]/30 transition hover:from-[#f6e1b6] hover:to-[#d48755] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={disabled}
          >
            {submitLabel}
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
                setRetryDeadlineMs(null)
                setRetryCountdownSeconds(0)
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
    </InteractiveShell>
  )
}
