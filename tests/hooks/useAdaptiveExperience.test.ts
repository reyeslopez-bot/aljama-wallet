import { describe, expect, it } from 'vitest'
import { evaluateAdaptiveExperience } from '@/hooks/useAdaptiveExperience'

describe('evaluateAdaptiveExperience', () => {
  it('enables lightweight mode for data-saver and slow connections', () => {
    const state = evaluateAdaptiveExperience({
      prefersReducedMotion: false,
      saveData: true,
      effectiveType: '2g',
      deviceMemory: 8,
      hardwareConcurrency: 8,
    })

    expect(state.isLowBandwidth).toBe(true)
    expect(state.shouldReduceMotion).toBe(true)
    expect(state.shouldUseLightweightMode).toBe(true)
  })

  it('reduces motion on low-performance devices even when the network is fast', () => {
    const state = evaluateAdaptiveExperience({
      prefersReducedMotion: false,
      saveData: false,
      effectiveType: '4g',
      deviceMemory: 2,
      hardwareConcurrency: 2,
    })

    expect(state.isLowPerformanceDevice).toBe(true)
    expect(state.shouldReduceMotion).toBe(true)
    expect(state.shouldUseLightweightMode).toBe(true)
  })

  it('keeps full enhancement enabled when runtime signals are healthy', () => {
    const state = evaluateAdaptiveExperience({
      prefersReducedMotion: false,
      saveData: false,
      effectiveType: '4g',
      deviceMemory: 8,
      hardwareConcurrency: 8,
    })

    expect(state.isLowBandwidth).toBe(false)
    expect(state.isLowPerformanceDevice).toBe(false)
    expect(state.shouldReduceMotion).toBe(false)
    expect(state.shouldUseLightweightMode).toBe(false)
  })
})
