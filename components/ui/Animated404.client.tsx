"use client"

import Link from "next/link"
import { motion } from "framer-motion"

export default function Animated404() {
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
        <motion.div
          aria-hidden
          className="mr-[-8px]"
          animate={{ y: [-10, 10, -10] }}
          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
        >
          4
        </motion.div>
        <motion.div
          aria-hidden
          className="mr-[-8px]"
          animate={{ y: [-12, 8, -12] }}
          transition={{ repeat: Infinity, duration: 2.2, ease: "easeInOut" }}
        >
          0
        </motion.div>
        <motion.div
          aria-hidden
          animate={{ y: [-8, 12, -8] }}
          transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
        >
          4
        </motion.div>
      </div>

      <Link
        href="/"
        className="absolute bottom-12 text-sm underline text-saffron/80 hover:text-saffron"
      >
        Go home
      </Link>
    </div>
  )
}
