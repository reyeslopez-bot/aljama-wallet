'use client'

import { gsap } from 'gsap'
import { useEffect, type RefObject } from 'react'

type UseStartFlowMotionOptions = {
  enabled: boolean
  shouldReduceMotion: boolean
}

export function useStartFlowMotion<T extends HTMLElement>(
  rootRef: RefObject<T | null>,
  { enabled, shouldReduceMotion }: UseStartFlowMotionOptions,
) {
  useEffect(() => {
    const root = rootRef.current
    if (!enabled || !root) return

    const setup = () => {
      const steps = Array.from(root.querySelectorAll<HTMLElement>('[data-start-flow-step]'))
      const lines = Array.from(root.querySelectorAll<HTMLElement>('[data-start-flow-line]'))
      const activeNode = root.querySelector<HTMLElement>('[data-start-flow-node-active="true"]')

      if (!steps.length && !lines.length && !activeNode) return

      if (steps.length) gsap.killTweensOf(steps)
      if (lines.length) gsap.killTweensOf(lines)
      if (activeNode) gsap.killTweensOf(activeNode)

      if (shouldReduceMotion) {
        if (steps.length) gsap.set(steps, { autoAlpha: 1, y: 0 })
        if (lines.length) gsap.set(lines, { scaleY: 1, transformOrigin: 'top center' })
        if (activeNode) gsap.set(activeNode, { scale: 1 })
        return
      }

      if (lines.length) gsap.set(lines, { scaleY: 0, transformOrigin: 'top center' })
      if (steps.length) gsap.set(steps, { autoAlpha: 0, y: 8 })

      const timeline = gsap.timeline({ defaults: { ease: 'power2.out' } })
      if (lines.length) {
        timeline.to(lines, { scaleY: 1, duration: 0.28, stagger: 0.08 })
      }
      if (steps.length) {
        timeline.to(steps, { autoAlpha: 1, y: 0, duration: 0.28, stagger: 0.08 }, '<0.04')
      }

      if (activeNode) {
        gsap.to(activeNode, {
          scale: 1.06,
          duration: 0.9,
          ease: 'sine.inOut',
          repeat: -1,
          yoyo: true,
        })
      }
    }

    const ctx = typeof gsap.context === 'function' ? gsap.context(setup, root) : null
    if (!ctx) setup()

    return () => {
      ctx?.revert()
    }
  }, [enabled, rootRef, shouldReduceMotion])
}
