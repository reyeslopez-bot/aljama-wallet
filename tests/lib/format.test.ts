import { describe, it, expect } from 'vitest'
import { formatShortAddress } from '@/lib/format'

describe('formatShortAddress', () => {
  it('returns em-dash for undefined', () => {
    expect(formatShortAddress(undefined)).toBe('—')
  })

  it('returns em-dash for null', () => {
    expect(formatShortAddress(null)).toBe('—')
  })

  it('returns em-dash for empty string', () => {
    expect(formatShortAddress('')).toBe('—')
  })

  it('returns address unchanged when 12 chars or fewer', () => {
    expect(formatShortAddress('0x1234567890')).toBe('0x1234567890')
    expect(formatShortAddress('short')).toBe('short')
    expect(formatShortAddress('123456789012')).toBe('123456789012')
  })

  it('truncates addresses longer than 12 chars', () => {
    const addr = '0x1234567890abcdef'
    expect(formatShortAddress(addr)).toBe('0x1234…cdef')
  })

  it('truncates a full Ethereum address', () => {
    const addr = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'
    const result = formatShortAddress(addr)
    expect(result).toMatch(/^0xd8dA…/)
    expect(result.endsWith('6045')).toBe(true)
    expect(result).toContain('…')
  })

  it('trims surrounding whitespace before measuring length', () => {
    const padded = '  0xabcdef1234567890  '
    const result = formatShortAddress(padded)
    expect(result).toContain('…')
  })
})
