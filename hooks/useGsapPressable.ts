'use client'

import type { FocusEventHandler, PointerEventHandler } from 'react'
import { useCallback, useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { useAdaptiveExperience } from '@/hooks/useAdaptiveExperience'

type TransformState = {
  x?: number
  y?: number
  scale?: number
  rotate?: number
}

type GsapPressableOptions = {
  base?: TransformState
  hover?: TransformState
  press?: TransformState
  duration?: number
  ease?: string
  enabled?: boolean
  respectReducedMotion?: boolean
}

const DEFAULT_STATE = {
  x: 0,
  y: 0,
  scale: 1,
  rotate: 0,
} satisfies Required<TransformState>

export function useGsapPressable<T extends HTMLElement>({
  base,
  hover,
  press,
  duration = 0.18,
  ease = 'power2.out',
  enabled = true,
  respectReducedMotion = true,
}: GsapPressableOptions = {}) {
  const elementRef = useRef<T | null>(null)
  const hoveredRef = useRef(false)
  const pressedRef = useRef(false)
  const { shouldReduceMotion } = useAdaptiveExperience()
  const shouldAnimate = enabled && (!respectReducedMotion || !shouldReduceMotion)

  const resolveState = useCallback(
    (hovered: boolean, pressed: boolean) => {
      const nextState = { ...DEFAULT_STATE, ...base }
      if (hovered && hover) Object.assign(nextState, hover)
      if (pressed && press) Object.assign(nextState, press)
      return nextState
    },
    [base, hover, press],
  )

  const applyState = useCallback(
    (hovered: boolean, pressed: boolean) => {
      const node = elementRef.current
      if (!node) return

      const nextState = resolveState(hovered, pressed)
      gsap.killTweensOf(node)

      if (!shouldAnimate) {
        gsap.set(node, nextState)
        return
      }

      gsap.to(node, {
        ...nextState,
        duration,
        ease,
        overwrite: 'auto',
      })
    },
    [duration, ease, resolveState, shouldAnimate],
  )

  useEffect(() => {
    hoveredRef.current = false
    pressedRef.current = false

    const node = elementRef.current
    if (!node) return

    gsap.killTweensOf(node)
    gsap.set(node, resolveState(false, false))

    return () => {
      gsap.killTweensOf(node)
    }
  }, [resolveState, shouldAnimate])

  const onPointerEnter = useCallback<PointerEventHandler<T>>(() => {
    hoveredRef.current = true
    applyState(true, pressedRef.current)
  }, [applyState])

  const onPointerLeave = useCallback<PointerEventHandler<T>>(() => {
    hoveredRef.current = false
    pressedRef.current = false
    applyState(false, false)
  }, [applyState])

  const onPointerDown = useCallback<PointerEventHandler<T>>(
    (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return
      pressedRef.current = true
      applyState(hoveredRef.current, true)
    },
    [applyState],
  )

  const onPointerUp = useCallback<PointerEventHandler<T>>(() => {
    pressedRef.current = false
    applyState(hoveredRef.current, false)
  }, [applyState])

  const onPointerCancel = useCallback<PointerEventHandler<T>>(() => {
    pressedRef.current = false
    applyState(hoveredRef.current, false)
  }, [applyState])

  const onBlur = useCallback<FocusEventHandler<T>>(() => {
    hoveredRef.current = false
    pressedRef.current = false
    applyState(false, false)
  }, [applyState])

  return {
    ref: elementRef,
    onPointerEnter,
    onPointerLeave,
    onPointerDown,
    onPointerUp,
    onPointerCancel,
    onBlur,
  }
}
