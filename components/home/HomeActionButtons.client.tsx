// components/home/HomeActionButtons.client.tsx 
"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { useLocale, useTranslations } from "next-intl"
import { useSession } from "next-auth/react"
import UnlockActionsLink from '@/components/ui/UnlockActionsLink.client'

type Btn =
  | { kind: "anchor"; label: string; href: string; bg: string }

const surface = (bg: string) => ({
  backgroundImage: bg,
  borderRadius: "9999px",
  boxShadow:
    "0 16px 36px rgba(12,10,8,0.28), inset 0 0 0 1px rgba(255,255,255,0.6)",
  border: "1px solid rgba(255,255,255,0.25)",
} as const)

export default function HomeActionButtons() {
  const t = useTranslations("actions")
  const locale = useLocale()
  const { status: sessionStatus } = useSession()
  const locked = sessionStatus === "unauthenticated"

  const buttons: Btn[] = [
    {
      kind: "anchor",
      label: t("createWallet"),
      href: `/${locale}/#create`,
      bg: "linear-gradient(135deg, #f3d9aa 0%, #e0ad70 45%, #c67a4a 100%)",
    },
    {
      kind: "anchor",
      label: t("connectWallet"),
      href: `/${locale}/#connect`,
      bg: "linear-gradient(135deg, #7fb0d9 0%, #5c8db4 50%, #4b7c79 100%)",
    },
    {
      kind: "anchor",
      label: t("xrpl"),
      href: `/${locale}/#xrpl`,
      bg: "linear-gradient(135deg, #e8d2a2 0%, #c8ab72 50%, #a1804f 100%)",
    },
  ]

  return (
    <div className="w-full">
      <div className="mx-auto grid w-full max-w-3xl grid-cols-3 gap-4 md:gap-6">
        {buttons.map((b) => (
          <Link
            key={b.label}
            href={b.href}
            onClick={(event) => {
              if (locked) event.preventDefault()
            }}
            aria-disabled={locked}
            tabIndex={locked ? -1 : 0}
            className={`block w-full bg-transparent p-0 border-0 outline-none appearance-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saffron/60 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent ${
              locked ? "pointer-events-none opacity-60" : ""
            }`}
            aria-label={b.label}
          >
            <motion.div
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              transition={{ type: "spring", stiffness: 220, damping: 18 }}
              className="flex h-[78px] w-full items-center justify-center px-10 text-[17px] font-semibold tracking-wide text-ivory drop-shadow-[0_1px_0_rgba(0,0,0,0.45)] transition-all md:h-[86px] md:text-[18px]"
              style={surface(b.bg)}
            >
              <span>{b.label}</span>
            </motion.div>
          </Link>
        ))}
      </div>
      {locked && (
        <UnlockActionsLink
          className="mt-4 block w-full text-center text-xs uppercase tracking-[0.18em] text-saffron/75"
        />
      )}
    </div>
  )
}
