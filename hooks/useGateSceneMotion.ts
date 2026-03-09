'use client'

import { gsap } from 'gsap'
import { useEffect } from 'react'
import type { RefObject } from 'react'

type GateSceneMotionConfig = {
  rootRef: RefObject<HTMLElement | null>
  panelRef: RefObject<HTMLElement | null>
  reduceMotion: boolean
  selectors: {
    stage: string
    core: string
    auras: string
    lines: string
    introGroups: string[]
  }
  intro: {
    panelY: number
    stageY: number
    stageScale: number
    auraScale: number
  }
  parallax: {
    stageX: number
    stageY: number
    panelRotateX: number
    panelRotateY: number
    coreX: number
    coreY: number
  }
}

export function useGateSceneMotion(config: GateSceneMotionConfig) {
  useEffect(() => {
    const root = config.rootRef.current
    const panel = config.panelRef.current
    if (!root || !panel || config.reduceMotion) return

    if (typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches) {
      return
    }

    let cleanupPointer = () => {}

    const setup = () => {
      const stage = root.querySelector<HTMLElement>(config.selectors.stage)
      const core = root.querySelector<HTMLElement>(config.selectors.core)
      const auras = Array.from(root.querySelectorAll<HTMLElement>(config.selectors.auras))
      const lines = Array.from(root.querySelectorAll<SVGPathElement>(config.selectors.lines))

      gsap.set(panel, {
        transformPerspective: 1200,
        transformOrigin: '50% 50%',
      })

      const timeline = gsap.timeline({ defaults: { ease: 'power3.out' } })

      timeline.from(panel, { autoAlpha: 0, y: config.intro.panelY, scale: 0.97, duration: 0.95 })
      if (stage) {
        timeline.from(stage, { autoAlpha: 0, y: config.intro.stageY, scale: config.intro.stageScale, duration: 0.88 }, '<0.12')
      }
      if (auras.length > 0) {
        timeline.from(auras, { autoAlpha: 0, scale: config.intro.auraScale, duration: 0.8, stagger: 0.06 }, '<0.08')
      }
      if (lines.length > 0) {
        timeline.from(lines, { scaleX: 0, transformOrigin: '50% 50%', duration: 0.82, stagger: 0.04 }, '<0.05')
      }

      config.selectors.introGroups.forEach((selector, index) => {
        const nodes = Array.from(root.querySelectorAll<HTMLElement>(selector))
        if (nodes.length === 0) return
        timeline.from(nodes, { autoAlpha: 0, y: index === 0 ? 16 : -10, duration: 0.45, stagger: 0.05 }, '<0.04')
      })

      auras.forEach((node, index) => {
        gsap.to(node, {
          rotate: index % 2 === 0 ? 360 : -360,
          duration: 34 + index * 8,
          ease: 'none',
          repeat: -1,
        })
      })

      if (!stage || !core || typeof gsap.quickTo !== 'function') return

      const stageXTo = gsap.quickTo(stage, 'x', { duration: 0.45, ease: 'power3.out' })
      const stageYTo = gsap.quickTo(stage, 'y', { duration: 0.45, ease: 'power3.out' })
      const panelRotateXTo = gsap.quickTo(panel, 'rotationX', { duration: 0.6, ease: 'power3.out' })
      const panelRotateYTo = gsap.quickTo(panel, 'rotationY', { duration: 0.6, ease: 'power3.out' })
      const coreXTo = gsap.quickTo(core, 'x', { duration: 0.5, ease: 'power3.out' })
      const coreYTo = gsap.quickTo(core, 'y', { duration: 0.5, ease: 'power3.out' })

      const handlePointerMove = (event: PointerEvent) => {
        const bounds = panel.getBoundingClientRect()
        const offsetX = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2
        const offsetY = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2

        stageXTo(offsetX * config.parallax.stageX)
        stageYTo(offsetY * config.parallax.stageY)
        panelRotateXTo(-offsetY * config.parallax.panelRotateX)
        panelRotateYTo(offsetX * config.parallax.panelRotateY)
        coreXTo(offsetX * config.parallax.coreX)
        coreYTo(offsetY * config.parallax.coreY)
      }

      const handlePointerLeave = () => {
        stageXTo(0)
        stageYTo(0)
        panelRotateXTo(0)
        panelRotateYTo(0)
        coreXTo(0)
        coreYTo(0)
      }

      panel.addEventListener('pointermove', handlePointerMove)
      panel.addEventListener('pointerleave', handlePointerLeave)
      cleanupPointer = () => {
        panel.removeEventListener('pointermove', handlePointerMove)
        panel.removeEventListener('pointerleave', handlePointerLeave)
      }
    }

    const ctx = typeof gsap.context === 'function' ? gsap.context(setup, config.rootRef) : null
    if (!ctx) setup()

    return () => {
      cleanupPointer()
      ctx?.revert()
    }
  }, [config])
}
