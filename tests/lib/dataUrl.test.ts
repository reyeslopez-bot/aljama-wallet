import { describe, it, expect } from 'vitest'
import { estimateDataUrlBytes } from '@/lib/dataUrl'

describe('estimateDataUrlBytes', () => {
  it('returns 0 for an empty data URL', () => {
    expect(estimateDataUrlBytes('data:image/png;base64,')).toBe(0)
  })

  it('returns 0 for a plain string with no comma', () => {
    expect(estimateDataUrlBytes('nodataprefix')).toBe(0)
  })

  it('estimates correctly for payload with no padding', () => {
    // "Man" base64 encodes to "TWFu" (3 bytes, no padding)
    expect(estimateDataUrlBytes('data:text/plain;base64,TWFu')).toBe(3)
  })

  it('estimates correctly for payload with one padding char', () => {
    // "Ma" -> "TWE=" (2 bytes)
    expect(estimateDataUrlBytes('data:text/plain;base64,TWE=')).toBe(2)
  })

  it('estimates correctly for payload with two padding chars', () => {
    // "M" -> "TQ==" (1 byte)
    expect(estimateDataUrlBytes('data:text/plain;base64,TQ==')).toBe(1)
  })

  it('never returns a negative value for degenerate input', () => {
    expect(estimateDataUrlBytes('data:,=')).toBeGreaterThanOrEqual(0)
    expect(estimateDataUrlBytes('data:,==')).toBeGreaterThanOrEqual(0)
  })

  it('handles a realistic small PNG data URL', () => {
    // 68-char payload: floor(68*3/4) - 2 = 51 - 2 = 49
    const payload = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    const url = `data:image/png;base64,${payload}`
    expect(estimateDataUrlBytes(url)).toBeGreaterThan(0)
  })
})
