"use client"

import Link from "next/link"
import { useEffect, useRef } from "react"
import { gsap } from "gsap"
import { useLocale, useTranslations } from "next-intl"
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion"

export default function Animated404() {
  const t = useTranslations("notFound")
  const locale = useLocale()
  const reduceMotion = usePrefersReducedMotion()
  const digitRefs = useRef<Array<HTMLDivElement | null>>([])

  useEffect(() => {
    const nodes = digitRefs.current.filter((node): node is HTMLDivElement => node !== null)
    if (nodes.length === 0) return

    nodes.forEach((node) => {
      gsap.killTweensOf(node)
      gsap.set(node, { y: 0 })
    })

    if (reduceMotion) return

    const tweens = [
      gsap.fromTo(nodes[0], { y: -10 }, { y: 10, duration: 1, ease: "sine.inOut", repeat: -1, yoyo: true }),
      gsap.fromTo(nodes[1], { y: -12 }, { y: 8, duration: 1.1, ease: "sine.inOut", repeat: -1, yoyo: true }),
      gsap.fromTo(nodes[2], { y: -8 }, { y: 12, duration: 0.9, ease: "sine.inOut", repeat: -1, yoyo: true }),
    ]

    return () => {
      tweens.forEach((tween) => tween.kill())
    }
  }, [reduceMotion])

  return (
    <div
      role="region"
      aria-label="404 Not Found Page"
      tabIndex={0}
      className="min-h-screen w-full flex flex-col items-center justify-center relative overflow-hidden p-8 text-ivory"
      style={{
        fontFamily: "var(--font-display), serif",
        fontSize: "170px",
        fontWeight: 700,
        letterSpacing: "-0.01em",
        lineHeight: "1.5em",
      }}
    >
      <div className="flex justify-center">
        <div
          ref={(node) => {
            digitRefs.current[0] = node
          }}
          aria-hidden
          className="mr-[-8px]"
        >
          4
        </div>
        <div
          ref={(node) => {
            digitRefs.current[1] = node
          }}
          aria-hidden
          className="mr-[-8px]"
        >
          0
        </div>
        <div
          ref={(node) => {
            digitRefs.current[2] = node
          }}
          aria-hidden
        >
          4
        </div>
      </div>

      <Link
        href={`/${locale}`}
        className="absolute bottom-12 text-sm underline text-saffron/80 hover:text-saffron"
      >
        {t("goHome")}
      </Link>
    </div>
  )
}
