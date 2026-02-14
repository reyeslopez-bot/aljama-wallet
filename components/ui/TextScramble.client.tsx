'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'

const DEFAULT_SCRAMBLE_SET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*'

type TextScrambleProps = {
  text: string
  ariaLabel?: string
  className?: string
  color?: string
  fontSize?: number
  fontWeight?: number
  durationMs?: number
  staggerMs?: number
  scrambleSet?: string
  animateOnMount?: boolean
}

function randomChar(pool: string) {
  const index = Math.floor(Math.random() * pool.length)
  return pool[index] ?? 'X'
}

export default function TextScramble({
  text,
  ariaLabel,
  className,
  color = 'rgb(0, 111, 255)',
  fontSize = 40,
  fontWeight = 700,
  durationMs = 950,
  staggerMs = 40,
  scrambleSet = DEFAULT_SCRAMBLE_SET,
  animateOnMount = true,
}: TextScrambleProps) {
  const finalChars = useMemo(() => Array.from(text), [text])
  const [chars, setChars] = useState<string[]>(finalChars)
  const hasAnimatedRef = useRef(false)

  useEffect(() => {
    if (!animateOnMount || hasAnimatedRef.current) {
      setChars(finalChars)
      return
    }
    hasAnimatedRef.current = true

    let rafId = 0
    const startedAt = performance.now()
    const totalDuration = durationMs + finalChars.length * staggerMs

    const tick = (now: number) => {
      const elapsed = now - startedAt
      const nextChars = finalChars.map((targetChar, index) => {
        if (targetChar === ' ') return ' '
        const revealAt = index * staggerMs
        if (elapsed <= revealAt) return randomChar(scrambleSet)
        if (elapsed >= revealAt + durationMs) return targetChar
        return randomChar(scrambleSet)
      })

      setChars(nextChars)

      if (elapsed < totalDuration) {
        rafId = window.requestAnimationFrame(tick)
        return
      }
      setChars(finalChars)
    }

    rafId = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(rafId)
  }, [animateOnMount, durationMs, finalChars, scrambleSet, staggerMs])

  const rootStyle: CSSProperties = {
    color,
    fontSize: `${fontSize}px`,
    fontWeight,
    display: 'inline-block',
    whiteSpace: 'pre',
    lineHeight: 1.05,
  }

  return (
    <span aria-label={ariaLabel ?? text} className={className} style={rootStyle}>
      {chars.map((char, index) => (
        <span key={`${index}-${finalChars.length}`} style={{ display: 'inline-block' }} aria-hidden="true">
          {char === ' ' ? '\u00A0' : char}
        </span>
      ))}
    </span>
  )
}
