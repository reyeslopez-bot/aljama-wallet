// components/home/HomeActionButtons.client.tsx 
"use client"

import { motion } from "framer-motion"
import { useConnectModal } from "@rainbow-me/rainbowkit"
import { useRouter } from "next/navigation"

type Btn =
  | { kind: "route"; label: string; href: string; bg: string; fg: string }
  | { kind: "connect"; label: string; bg: string; fg: string }

const buttons: Btn[] = [
  {
    kind: "route",
    label: "Create Wallet",
    href: "/wallet/create",
    bg: "linear-gradient(135deg, #f6d7b0 0%, #e7b77f 45%, #cf8b58 100%)",
    fg: "#1A1A1A",
  },
  {
    kind: "connect",
    label: "Connect Wallet",
    bg: "linear-gradient(135deg, #f4c08d 0%, #e39a5e 50%, #c7703d 100%)",
    fg: "#160E08",
  },
  {
    kind: "route",
    label: "Discover",
    href: "/discover",
    bg: "linear-gradient(135deg, #f7e1b6 0%, #e0c48a 50%, #b9935a 100%)",
    fg: "#2A1C0F",
  },
]

const surface = (bg: string) => ({
  backgroundImage: bg,
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
