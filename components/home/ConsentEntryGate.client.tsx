"use client"

import * as React from "react"
import { gsap } from "gsap"
import { usePathname, useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion"
import { setLocationConsent, getLocationConsent } from "@/infra/location/client"
import { getTelemetryConsent, setTelemetryConsent } from "@/infra/telemetry/client"
import {
  CONSENT_MODE_KEY,
  CONSENT_PROMPT_SESSION_KEY,
  CONSENT_SITE_ENTRY_SESSION_KEY,
} from "@/infra/consent/constants"

type ConsentPreset = "rejectAll" | "essentialOnly" | "allowAll"

const LANGUAGES = [
  { label: "EN", value: "en" },
  { label: "HE", value: "he" },
  { label: "AR", value: "ar" },
]

export default function ConsentEntryGate() {
  const tConsent = useTranslations("consent")
  const tAuth = useTranslations("auth")
  const locale = useLocale()
  const pathname = usePathname()
  const router = useRouter()
  const rootRef = React.useRef<HTMLDivElement | null>(null)
  const panelRef = React.useRef<HTMLDivElement | null>(null)
  const switchThumbRef = React.useRef<HTMLSpanElement | null>(null)
  const reduceMotion = usePrefersReducedMotion()

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

  React.useEffect(() => {
    if (!rootRef.current || reduceMotion) return

    let cleanupPointer = () => {}
    const setupScene = () => {
      const panel = panelRef.current
      const stage = rootRef.current?.querySelector<HTMLElement>("[data-consent-stage]")
      const core = rootRef.current?.querySelector<HTMLElement>("[data-consent-core]")
      const halos = Array.from(rootRef.current?.querySelectorAll<HTMLElement>("[data-consent-aura]") ?? [])
      const rails = Array.from(rootRef.current?.querySelectorAll<SVGPathElement>("[data-consent-rail]") ?? [])
      const nodes = Array.from(rootRef.current?.querySelectorAll<HTMLElement>("[data-consent-node]") ?? [])
      const pills = Array.from(rootRef.current?.querySelectorAll<HTMLElement>("[data-consent-pill]") ?? [])
      const choices = Array.from(rootRef.current?.querySelectorAll<HTMLElement>("[data-consent-choice]") ?? [])
      const languages = Array.from(rootRef.current?.querySelectorAll<HTMLElement>("[data-consent-lang]") ?? [])

      if (panel) {
        gsap.set(panel, {
          transformPerspective: 1200,
          transformOrigin: "50% 50%",
        })
      }

      const intro = gsap.timeline({ defaults: { ease: "power3.out" } })

      if (panel) {
        intro.from(panel, { autoAlpha: 0, y: 30, scale: 0.97, duration: 0.95 })
      }
      if (stage) {
        intro.from(stage, { autoAlpha: 0, y: 18, scale: 0.95, duration: 0.88 }, "<0.12")
      }
      if (halos.length > 0) {
        intro.from(halos, { autoAlpha: 0, scale: 0.76, duration: 0.8, stagger: 0.06 }, "<0.08")
      }
      if (rails.length > 0) {
        intro.from(
          rails,
          { scaleX: 0, transformOrigin: "50% 50%", duration: 0.82, stagger: 0.04 },
          "<0.05",
        )
      }
      if (nodes.length > 0) {
        intro.from(nodes, { autoAlpha: 0, y: 16, scale: 0.78, duration: 0.55, stagger: 0.06 }, "<0.06")
      }
      if (pills.length > 0) {
        intro.from(pills, { autoAlpha: 0, y: -12, duration: 0.42, stagger: 0.04 }, "<0.04")
      }
      if (languages.length > 0) {
        intro.from(languages, { autoAlpha: 0, y: -8, duration: 0.35, stagger: 0.04 }, "<0.02")
      }
      if (choices.length > 0) {
        intro.from(choices, { autoAlpha: 0, y: 10, duration: 0.45, stagger: 0.05 }, "-=0.24")
      }

      halos.forEach((node, index) => {
        gsap.to(node, {
          rotate: index % 2 === 0 ? 360 : -360,
          duration: 34 + index * 8,
          ease: "none",
          repeat: -1,
        })
      })

      if (!panel || !stage || !core) return

      if (typeof gsap.quickTo !== "function") return

      const stageXTo = gsap.quickTo(stage, "x", { duration: 0.45, ease: "power3.out" })
      const stageYTo = gsap.quickTo(stage, "y", { duration: 0.45, ease: "power3.out" })
      const panelRotateXTo = gsap.quickTo(panel, "rotationX", { duration: 0.6, ease: "power3.out" })
      const panelRotateYTo = gsap.quickTo(panel, "rotationY", { duration: 0.6, ease: "power3.out" })
      const coreXTo = gsap.quickTo(core, "x", { duration: 0.5, ease: "power3.out" })
      const coreYTo = gsap.quickTo(core, "y", { duration: 0.5, ease: "power3.out" })

      const handlePointerMove = (event: PointerEvent) => {
        const bounds = panel.getBoundingClientRect()
        const offsetX = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2
        const offsetY = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2

        stageXTo(offsetX * 10)
        stageYTo(offsetY * 6)
        panelRotateXTo(-offsetY * 2.6)
        panelRotateYTo(offsetX * 3.4)
        coreXTo(offsetX * 12)
        coreYTo(offsetY * 8)
      }

      const handlePointerLeave = () => {
        stageXTo(0)
        stageYTo(0)
        panelRotateXTo(0)
        panelRotateYTo(0)
        coreXTo(0)
        coreYTo(0)
      }

      panel.addEventListener("pointermove", handlePointerMove)
      panel.addEventListener("pointerleave", handlePointerLeave)

      cleanupPointer = () => {
        panel.removeEventListener("pointermove", handlePointerMove)
        panel.removeEventListener("pointerleave", handlePointerLeave)
      }
    }

    if (typeof gsap.context === "function") {
      const ctx = gsap.context(setupScene, rootRef)
      return () => {
        cleanupPointer()
        ctx.revert()
      }
    }

    setupScene()
    return () => {
      cleanupPointer()
    }
  }, [reduceMotion])

  React.useEffect(() => {
    if (!rootRef.current) return

    const syncStageState = () => {
      const essentialNode = rootRef.current?.querySelector<HTMLElement>('[data-consent-node="essential"]')
      const locationNode = rootRef.current?.querySelector<HTMLElement>('[data-consent-node="location"]')
      const telemetryNode = rootRef.current?.querySelector<HTMLElement>('[data-consent-node="telemetry"]')
      const locationRail = rootRef.current?.querySelector<SVGPathElement>('[data-consent-rail="location"]')
      const telemetryRail = rootRef.current?.querySelector<SVGPathElement>('[data-consent-rail="telemetry"]')
      const core = rootRef.current?.querySelector<HTMLElement>("[data-consent-core]")
      const optionalNodes = [locationNode, telemetryNode].filter(Boolean) as HTMLElement[]
      const optionalRails = [locationRail, telemetryRail].filter(Boolean) as SVGPathElement[]

      if (switchThumbRef.current) {
        gsap.to(switchThumbRef.current, {
          x: optionalServicesEnabled ? 22 : 0,
          duration: reduceMotion ? 0 : 0.34,
          ease: "power2.out",
        })
      }

      if (essentialNode) {
        gsap.to(essentialNode, {
          scale: 1,
          autoAlpha: 1,
          duration: reduceMotion ? 0 : 0.28,
          ease: "power2.out",
        })
      }

      if (optionalNodes.length > 0) {
        gsap.to(optionalNodes, {
          autoAlpha: optionalServicesEnabled ? 1 : 0.48,
          scale: optionalServicesEnabled ? 1 : 0.84,
          y: optionalServicesEnabled ? 0 : 6,
          duration: reduceMotion ? 0 : 0.42,
          ease: "power2.out",
          stagger: 0.04,
        })
      }

      if (optionalRails.length > 0) {
        gsap.to(optionalRails, {
          opacity: optionalServicesEnabled ? 0.96 : 0.32,
          scaleX: optionalServicesEnabled ? 1 : 0.82,
          transformOrigin: "50% 50%",
          duration: reduceMotion ? 0 : 0.42,
          ease: "power2.out",
          stagger: 0.04,
        })
      }

      if (core) {
        gsap.to(core, {
          scale: optionalServicesEnabled ? 1.06 : 1,
          duration: reduceMotion ? 0 : 0.42,
          ease: "power2.out",
        })
      }
    }

    if (typeof gsap.context === "function") {
      const ctx = gsap.context(syncStageState, rootRef)
      return () => ctx.revert()
    }

    syncStageState()
  }, [optionalServicesEnabled, reduceMotion])

  const handleContinue = React.useCallback(async () => {
    if (busy) return
    setBusy(true)
    try {
      applyConsentPreset(consentPreset)
      router.push(`/${locale}`)
    } finally {
      setBusy(false)
    }
  }, [applyConsentPreset, busy, consentPreset, locale, router])

  return (
    <div
      ref={rootRef}
      data-testid="consent-gate-root"
      className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-black/80 px-6 py-12"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(closest-side_at_50%_50%,rgba(210,167,98,0.12),rgba(255,255,255,0.00)_62%)]" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[720px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle_at_60%_40%,rgba(78,120,160,0.16),rgba(0,0,0,0)_60%)] blur-[20px]" />

      <div
        ref={panelRef}
        className="surface-panel panel-glow-saffron relative w-full max-w-xl rounded-[2rem] p-8 [transform-style:preserve-3d]"
      >
        <div className="absolute right-6 top-6 z-10 flex items-center gap-2">
          {LANGUAGES.map((language) => (
            <button
              key={language.value}
              data-consent-lang
              type="button"
              onClick={() => {
                const segments = pathname.split("/")
                if (segments.length > 1) {
                  segments[1] = language.value
                } else {
                  segments.push(language.value)
                }
                router.push(segments.join("/") || `/${language.value}`)
              }}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-[0.16em] transition ${
                locale === language.value
                  ? "border-saffron/60 bg-saffron/10 text-saffron"
                  : "border-white/10 bg-white/5 text-ivory/60 hover:border-white/20"
              }`}
            >
              {language.label}
            </button>
          ))}
        </div>
        <div className="absolute inset-x-10 top-6 ornament-line" />
        <div className="text-center">
          <div
            data-consent-stage
            className="consent-gate-stage relative mx-auto mb-6 mt-2 h-40 w-full max-w-[22rem]"
            aria-hidden="true"
          >
            <div data-consent-aura className="consent-gate-aura absolute inset-3 rounded-[2rem]" />
            <div data-consent-aura className="consent-gate-aura absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-[1.5rem]" />

            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 360 160" fill="none">
              <path
                data-consent-rail="location"
                className="consent-gate-rail"
                d="M178 82C146 72 116 60 88 44"
              />
              <path
                data-consent-rail="telemetry"
                className="consent-gate-rail"
                d="M182 82C214 72 244 60 272 44"
              />
              <path
                data-consent-rail="essential"
                className="consent-gate-rail"
                d="M180 84V124"
              />
            </svg>

            <div data-consent-pill className="consent-gate-pill absolute left-5 top-4">
              TRUST
            </div>
            <div data-consent-pill className="consent-gate-pill absolute right-5 top-8">
              OPT-IN
            </div>

            <div data-consent-node="location" className="consent-gate-node absolute left-14 top-5">
              LOC
            </div>
            <div data-consent-node="telemetry" className="consent-gate-node absolute right-14 top-5">
              TEL
            </div>
            <div data-consent-node="essential" className="consent-gate-node absolute bottom-3 left-1/2 -translate-x-1/2">
              CORE
            </div>

            <div
              data-consent-core
              className="consent-gate-core absolute left-1/2 top-1/2 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[1.75rem]"
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M12 2l8 4v6c0 5-3.2 9.7-8 10-4.8-.3-8-5-8-10V6l8-4z"
                  stroke="rgba(255,245,229,0.92)"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>
          <h2 className="font-display text-3xl font-semibold tracking-tight text-ivory sm:text-4xl">
            {tConsent("title")}
          </h2>
          <p className="mt-2 text-sm text-ivory/70">{tConsent("text")}</p>
        </div>

        <div className="mt-6 space-y-4">
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
                className={`relative h-7 w-12 rounded-full border transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  optionalServicesEnabled
                    ? "border-saffron/65 bg-saffron/35 shadow-[0_0_0_1px_rgba(210,167,98,0.18),0_0_20px_rgba(210,167,98,0.28)]"
                    : "border-white/20 bg-white/10"
                }`}
              >
                <span
                  ref={switchThumbRef}
                  style={{ transform: `translateX(${optionalServicesEnabled ? 22 : 0}px)` }}
                  className="absolute left-0.5 top-0.5 h-[22px] w-[22px] rounded-full bg-white shadow-[0_2px_10px_rgba(255,255,255,0.28)]"
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
                  data-consent-choice
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

          <div className="text-center text-xs text-ivory/62">
            <span>{tAuth("alreadyHaveAccount")}</span>{" "}
            <button
              type="button"
              onClick={() => router.push(`/${locale}/login?mode=login`)}
              className="font-semibold uppercase tracking-[0.12em] text-saffron transition hover:text-ivory"
            >
              {tAuth("signIn")}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
