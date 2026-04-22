"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useSession } from "next-auth/react"
import { useLocale, useTranslations } from "next-intl"
import { useConnection } from "wagmi"
import { useDynamicInfoStore } from "@/hooks/useDynamicInfoStore"
import { setLocationConsent, getLocationConsent } from "@/infra/location/client"
import { getTelemetryConsent, setTelemetryConsent } from "@/infra/telemetry/client"
import {
  CONSENT_MODE_KEY,
  CONSENT_PROMPT_SESSION_KEY,
  CONSENT_SITE_ENTRY_SESSION_KEY,
} from "@/infra/consent/constants"
import { resolveConsentReturnPath } from "@/infra/consent/routing"

type ConsentPreset = "rejectAll" | "essentialOnly" | "allowAll"

type ConsentEntryGateProps = {
  variant?: "page" | "inline"
}

export default function ConsentEntryGate({ variant = "page" }: ConsentEntryGateProps) {
  const tConsent = useTranslations("consent")
  const tAuth = useTranslations("auth")
  const tInfo = useTranslations("infoCard")
  const locale = useLocale()
  const searchParams = useSearchParams()
  const router = useRouter()
  const { status: sessionStatus } = useSession()
  const { address, isConnected } = useConnection()
  const wallet = useDynamicInfoStore((state) => state.wallet)

  const [consentPreset, setConsentPreset] = React.useState<ConsentPreset>("essentialOnly")
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    const telemetryConsent = getTelemetryConsent()
    const locationConsent = getLocationConsent()

    if (telemetryConsent === "granted") {
      setConsentPreset("allowAll")
      return
    }

    if (telemetryConsent === "denied" || locationConsent === "denied") {
      setConsentPreset("essentialOnly")
      return
    }

    setConsentPreset("essentialOnly")
  }, [])

  const applyConsentPreset = React.useCallback((preset: ConsentPreset) => {
    if (typeof window === "undefined") return

    window.localStorage.setItem(CONSENT_MODE_KEY, preset)
    window.sessionStorage.setItem(CONSENT_PROMPT_SESSION_KEY, "seen")
    window.sessionStorage.setItem(CONSENT_SITE_ENTRY_SESSION_KEY, "seen")

    if (preset === "allowAll") {
      setTelemetryConsent("granted")
      setLocationConsent("granted")
      return
    }

    setTelemetryConsent("denied")
    setLocationConsent("denied")
  }, [])

  const optionalServicesEnabled = consentPreset === "allowAll"
  const walletReady = Boolean(
    (isConnected && address) ||
    wallet.connectedAddress ||
    wallet.createdAddress,
  )
  const showNextSteps = !(sessionStatus === "authenticated" && walletReady)
  const showAuthPrompt = sessionStatus === "unauthenticated"
  const nextSteps = React.useMemo(
    () =>
      [
        {
          body: optionalServicesEnabled ? tConsent("optionalToggleOn") : tConsent("optionalToggleOff"),
          key: "permissions",
          title: tInfo("gettingStarted.steps.permissions.title"),
        },
        {
          body: tInfo("gettingStarted.steps.wallet.body"),
          key: "wallet",
          title: tInfo("gettingStarted.steps.wallet.title"),
        },
        {
          body: tInfo("gettingStarted.steps.track.body"),
          key: "track",
          title: tInfo("gettingStarted.steps.track.title"),
        },
      ] satisfies Array<{ body: string; key: string; title: string }>,
    [optionalServicesEnabled, tConsent, tInfo],
  )
  const nextPath = React.useMemo(
    () => resolveConsentReturnPath(locale, searchParams.get("next")),
    [locale, searchParams],
  )

  const handleContinue = React.useCallback(async () => {
    if (busy) return
    setBusy(true)
    try {
      applyConsentPreset(consentPreset)
      router.push(nextPath)
    } finally {
      setBusy(false)
    }
  }, [applyConsentPreset, busy, consentPreset, nextPath, router])
  const isInline = variant === "inline"

  return (
    <div
      data-testid="consent-gate-root"
      className={
        isInline
          ? "relative flex w-full items-center justify-center overflow-hidden"
          : "relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-black/80 px-6 py-12"
      }
    >
      {!isInline ? (
        <>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(closest-side_at_50%_50%,rgba(210,167,98,0.12),rgba(255,255,255,0.00)_62%)]" />
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-[720px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle_at_60%_40%,rgba(78,120,160,0.16),rgba(0,0,0,0)_60%)] blur-[20px]" />
        </>
      ) : null}

      <div
        className={`surface-panel panel-glow-saffron relative w-full rounded-[2rem] ${
          isInline ? "max-w-3xl p-6 sm:p-8" : "max-w-xl p-8"
        }`}
      >
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
            {tConsent("title")}
          </h2>
          <p className="mt-2 text-sm text-ivory/70">{tConsent("text")}</p>
        </div>

        <div className="mt-6 space-y-4">
          {showNextSteps ? (
            <div
              data-testid="consent-gate-next-steps"
              className="rounded-2xl border border-white/10 bg-[#07111d]/70 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-saffron/82">
                    {tConsent("nextTitle")}
                  </p>
                  <h3 className="mt-1 text-base font-semibold tracking-tight text-ivory">
                    {tConsent("nextBody")}
                  </h3>
                </div>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {nextSteps.map((step, index) => (
                  <div
                    key={step.key}
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-3"
                  >
                    <div className="text-[10px] uppercase tracking-[0.16em] text-saffron/78">
                      {index + 1}
                    </div>
                    <div className="mt-1 text-[12px] font-semibold uppercase tracking-[0.14em] text-ivory">
                      {step.title}
                    </div>
                    <p className="mt-1 text-[11px] leading-5 text-ivory/62">{step.body}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="surface-inner space-y-3 rounded-2xl border border-white/10 p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-saffron/80">{tConsent("eyebrow")}</p>
            <div
              data-consent-choice
              className="surface-soft flex items-center justify-between gap-3 rounded-xl border border-white/12 px-3 py-2.5"
            >
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-ivory/72">{tConsent("optionalToggleLabel")}</p>
                <p className="mt-1 text-[11px] text-ivory/55">{tConsent("optionalToggleHint")}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={optionalServicesEnabled}
                data-testid="consent-gate-optional-services-switch"
                onClick={() => setConsentPreset(optionalServicesEnabled ? "essentialOnly" : "allowAll")}
                disabled={busy}
                className={`relative h-7 w-12 rounded-full border border-white/20 bg-white/10 transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  optionalServicesEnabled
                    ? "shadow-[0_0_0_1px_rgba(240,215,160,0.16),0_0_18px_rgba(240,215,160,0.22)]"
                    : ""
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`absolute top-0.5 h-[22px] w-[22px] rounded-full bg-white transition ${
                    optionalServicesEnabled
                      ? "left-6 bg-white shadow-[0_0_12px_rgba(240,215,160,0.35)]"
                      : "left-0.5 bg-white/95"
                  }`}
                />
              </button>
            </div>
            <p className="text-[11px] text-ivory/52">
              {optionalServicesEnabled ? tConsent("optionalToggleOn") : tConsent("optionalToggleOff")}
            </p>
            <ul className="space-y-1 text-[11px] text-ivory/60">
              <li>{tConsent("essentialDetail")}</li>
              <li>{tConsent("locationDetail")}</li>
              <li>{tConsent("telemetryDetail")}</li>
            </ul>
            <div className="grid gap-2 sm:grid-cols-3">
              {(["rejectAll", "essentialOnly", "allowAll"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setConsentPreset(option)}
                  disabled={busy}
                  data-testid={`consent-gate-permission-${option}`}
                  className={`rounded-xl border px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    consentPreset === option
                      ? "border-saffron/55 bg-saffron/18 text-ivory"
                      : "border-white/12 bg-white/5 text-ivory/70 hover:bg-white/10"
                  }`}
                >
                  {tConsent(option)}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void handleContinue()}
              disabled={busy}
              data-testid="consent-gate-continue"
              className="w-full rounded-2xl border border-white/12 bg-white/5 px-4 py-3 text-sm font-semibold text-ivory/90 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? tConsent("acceptAndContinueLoading") : tConsent("acceptAndContinue")}
            </button>
          </div>

          {showAuthPrompt ? (
            <div className="text-center text-xs text-ivory/62">
              <span>{tAuth("alreadyHaveAccount")}</span>{" "}
              <button
                type="button"
                onClick={() => router.push(`/${locale}?mode=login#wallet`)}
                className="font-semibold uppercase tracking-[0.12em] text-saffron transition hover:text-ivory"
              >
                {tAuth("signIn")}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
