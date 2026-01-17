// components/home/HomeActionButtons.client.tsx 
"use client"

import Link from "next/link"
import { motion } from "framer-motion"

type Btn =
  | { kind: "anchor"; label: string; href: string; bg: string; fg: string }

const buttons: Btn[] = [
  {
    kind: "anchor",
    label: "Create Wallet",
    href: "#create",
    bg: "linear-gradient(135deg, #f6d7b0 0%, #e7b77f 45%, #cf8b58 100%)",
    fg: "#1A1A1A",
  },
  {
    kind: "anchor",
    label: "Connect Wallet",
    href: "#connect",
    bg: "linear-gradient(135deg, #f4c08d 0%, #e39a5e 50%, #c7703d 100%)",
    fg: "#160E08",
  },
  {
    kind: "anchor",
    label: "XRPL",
    href: "#xrpl",
    bg: "linear-gradient(135deg, #f7e1b6 0%, #e0c48a 50%, #b9935a 100%)",
    fg: "#2A1C0F",
  },
]

const surface = (bg: string) => ({
  backgroundImage: bg,
  borderRadius: "9999px",
  boxShadow:
    "0 12px 32px rgba(24,16,10,0.18), inset 0 0 0 1px rgba(255,255,255,0.65)",
  border: "1px solid rgba(255,255,255,0.35)",
} as const)

export default function HomeActionButtons() {
  return (
    <div className="w-full">
      <div className="mx-auto grid w-full max-w-3xl grid-cols-3 gap-4 md:gap-6">
        {buttons.map((b) => (
          <Link
            key={b.label}
            href={b.href}
            className="block w-full bg-transparent p-0 border-0 outline-none appearance-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
            aria-label={b.label}
          >
            <motion.div
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              transition={{ type: "spring", stiffness: 220, damping: 18 }}
              className="flex h-[82px] w-full items-center justify-center px-10 text-[17px] font-semibold tracking-tight drop-shadow-[0_1px_0_rgba(255,255,255,0.4)] transition-all md:h-[88px] md:text-[18px]"
              style={surface(b.bg)}
            >
              <span style={{ color: b.fg }}>{b.label}</span>
            </motion.div>
          </Link>
        ))}
      </div>
    </div>
  )
}
