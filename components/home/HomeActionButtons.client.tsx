// components/home/HomeActionButtons.client.tsx 
"use client"

import { motion } from "framer-motion"
import { useConnectModal } from "@rainbow-me/rainbowkit"
import { useRouter } from "next/navigation"

type Btn =
  | { kind: "route"; label: string; href: string; bg: string; fg: string }
  | { kind: "connect"; label: string; bg: string; fg: string }

const buttons: Btn[] = [
  { kind: "route", label: "Create Wallet", href: "/wallet/create", bg: "#D8D8D8", fg: "#1A1A1A" },
  { kind: "connect", label: "Connect Wallet", bg: "#CFE9DC", fg: "#0F1B14" },
  { kind: "route", label: "Discover", href: "/discover", bg: "#D6D3FF", fg: "#141033" },
]

const surface = (bg: string) => ({
  backgroundColor: bg,
  borderRadius: "9999px",
  boxShadow: "0 6px 24px rgba(0,0,0,0.18)",
} as const)

export default function HomeActionButtons() {
  const router = useRouter()
  const { openConnectModal } = useConnectModal()

  return (
    <div className="w-full">
      <div className="grid grid-cols-3 gap-[30px]">
        {buttons.map((b) => (
          <button
            key={b.label}
            type="button"
            onClick={() => {
              if (b.kind === "connect") return openConnectModal?.()
              router.push(b.href)
            }}
            className="block w-full bg-transparent p-0 border-0 outline-none appearance-none"
            aria-label={b.kind === "connect" ? "Connect a wallet" : b.label}
          >
            <motion.div
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              transition={{ type: "spring", stiffness: 220, damping: 18 }}
              className="h-[88px] w-full px-10 flex items-center justify-center text-[18px] font-semibold tracking-tight"
              style={surface(b.bg)}
            >
              <span style={{ color: b.fg }}>{b.label}</span>
            </motion.div>
          </button>
        ))}
      </div>
    </div>
  )
}