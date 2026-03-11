"use client"

import { useEffect, useRef } from "react"
import { gsap } from "gsap"
import { useAdaptiveExperience } from "@/hooks/useAdaptiveExperience"

export function LoadingPill({ message = "Loading..." }: { message?: string }) {
  const spinnerRef = useRef<HTMLDivElement | null>(null)
  const { shouldReduceMotion } = useAdaptiveExperience()

  useEffect(() => {
    const node = spinnerRef.current
    if (!node) return

    gsap.killTweensOf(node)
    gsap.set(node, { rotate: 0, transformOrigin: "50% 50%" })

    if (shouldReduceMotion) return

    const tween = gsap.to(node, {
      rotate: 360,
      duration: 0.9,
      ease: "none",
      repeat: -1,
    })

    return () => {
      tween.kill()
    }
  }, [shouldReduceMotion])

  return (
    <div className="min-h-[40vh] w-full flex items-center justify-center p-8">
      <div
        className="relative flex items-center gap-3 rounded-full px-4 py-3 shadow-sm"
        style={{
          backgroundColor: "rgb(15, 15, 15)",
          boxShadow:
            "rgba(0,0,0,0.08) 0px 2px 4px 0px, rgba(0,0,0,0.07) 0px 8px 8px 0px, rgba(0,0,0,0.04) 0px 17px 10px 0px, rgba(0,0,0,0.01) 0px 31px 12px 0px, rgba(0,0,0,0) 0px 48px 14px 0px",
        }}
        aria-live="polite"
        aria-busy="true"
      >
        <div className="relative h-5 w-5">
          <div
            className="absolute inset-0 rounded-full"
            style={{ border: "2px solid rgba(241,242,244,0.16)" }}
            aria-hidden
          />
          <div
            ref={spinnerRef}
            className="absolute inset-0 rounded-full"
            style={{
              border: "2px solid rgba(241,242,244,0.85)",
              borderTopColor: "transparent",
            }}
            aria-hidden
          />
        </div>

        <p className="text-sm text-[rgb(241,242,244)]">{message}</p>
      </div>
    </div>
  )
}
