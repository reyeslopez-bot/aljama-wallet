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
  boxShadow:
    "0 18px 40px rgba(32,18,8,0.24), 0 0 26px rgba(255,201,126,0.35), inset 0 0 0 1px rgba(255,255,255,0.5)",
  border: "1px solid rgba(255,255,255,0.25)",
} as const)

export default function HomeActionButtons() {
  const router = useRouter()
  const { openConnectModal } = useConnectModal()

  return (
    <div className="w-full">
      <div className="relative overflow-hidden rounded-[32px] border border-amber-200/30 bg-[radial-gradient(circle_at_top,_rgba(255,235,205,0.35),_rgba(24,16,10,0.08)),linear-gradient(120deg,_rgba(255,245,230,0.12),_rgba(255,200,140,0.08)_45%,_rgba(16,12,8,0.08))] p-6 shadow-[0_30px_80px_rgba(20,12,6,0.35)] backdrop-blur">
        <div className="pointer-events-none absolute inset-0 opacity-70 [background:conic-gradient(from_110deg_at_50%_-10%,_rgba(255,216,160,0.4),_rgba(255,255,255,0.05),_rgba(255,170,100,0.25),_rgba(255,255,255,0.05))]" />
        <div className="relative grid grid-cols-3 gap-4 md:gap-6">
          {buttons.map((b) => (
            <button
              key={b.label}
              type="button"
              onClick={() => {
                if (b.kind === "connect") return openConnectModal?.()
                router.push(b.href)
              }}
              className="block w-full bg-transparent p-0 border-0 outline-none appearance-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
              aria-label={b.kind === "connect" ? "Connect a wallet" : b.label}
            >
              <motion.div
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: "spring", stiffness: 220, damping: 18 }}
                className="group flex h-[84px] w-full items-center justify-center gap-3 px-8 text-[16px] font-semibold tracking-[0.02em] text-amber-950/90 drop-shadow-[0_1px_0_rgba(255,255,255,0.45)] transition-all md:h-[92px] md:text-[18px]"
                style={surface(b.bg)}
              >
                <span className="rounded-full border border-white/40 bg-white/30 px-4 py-1 text-xs uppercase tracking-[0.35em] text-amber-900/80 shadow-[inset_0_0_18px_rgba(255,255,255,0.3)]">
                  engage
                </span>
                <span style={{ color: b.fg }}>{b.label}</span>
              </motion.div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
