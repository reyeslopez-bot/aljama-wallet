import { describe, it, expect } from 'vitest'
import {
  TRADE_CURRENCY_OPTIONS,
  ISSUED_CURRENCY_OPTIONS,
  DEFAULT_QUOTE_ISSUER,
  ISSUER_ACCOUNT_FLAG_OPTIONS,
  ISSUER_POLICY_STATUS_OPTIONS,
  ISSUER_HOLDER_REVIEW_STATUS_OPTIONS,
} from '@/lib/xrpl-trade-constants'

describe('TRADE_CURRENCY_OPTIONS', () => {
  it('includes XRP as the first entry', () => {
    expect(TRADE_CURRENCY_OPTIONS[0].code).toBe('XRP')
  })

  it('has a non-empty label for every option', () => {
    for (const opt of TRADE_CURRENCY_OPTIONS) {
      expect(opt.label.length).toBeGreaterThan(0)
    }
  })

  it('has unique codes', () => {
    const codes = TRADE_CURRENCY_OPTIONS.map((o) => o.code)
    expect(new Set(codes).size).toBe(codes.length)
  })
})

describe('ISSUED_CURRENCY_OPTIONS', () => {
  it('does not include XRP', () => {
    expect(ISSUED_CURRENCY_OPTIONS.some((o) => o.code === 'XRP')).toBe(false)
  })

  it('is a strict subset of TRADE_CURRENCY_OPTIONS', () => {
    const tradeCodes = new Set(TRADE_CURRENCY_OPTIONS.map((o) => o.code))
    for (const opt of ISSUED_CURRENCY_OPTIONS) {
      expect(tradeCodes.has(opt.code)).toBe(true)
    }
  })

  it('has at least one option', () => {
    expect(ISSUED_CURRENCY_OPTIONS.length).toBeGreaterThan(0)
  })
})

describe('DEFAULT_QUOTE_ISSUER', () => {
  it('is a non-empty string', () => {
    expect(typeof DEFAULT_QUOTE_ISSUER).toBe('string')
    expect(DEFAULT_QUOTE_ISSUER.length).toBeGreaterThan(0)
  })

  it('looks like an XRPL classic address', () => {
    expect(DEFAULT_QUOTE_ISSUER).toMatch(/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/)
  })
})

describe('ISSUER_ACCOUNT_FLAG_OPTIONS', () => {
  it('includes a no-op entry with an empty value', () => {
    expect(ISSUER_ACCOUNT_FLAG_OPTIONS.some((o) => o.value === '')).toBe(true)
  })

  it('has unique values', () => {
    const values = ISSUER_ACCOUNT_FLAG_OPTIONS.map((o) => o.value)
    expect(new Set(values).size).toBe(values.length)
  })
})

describe('ISSUER_POLICY_STATUS_OPTIONS', () => {
  it('includes the four canonical statuses', () => {
    const values = ISSUER_POLICY_STATUS_OPTIONS.map((o) => o.value)
    expect(values).toContain('draft')
    expect(values).toContain('active')
    expect(values).toContain('paused')
    expect(values).toContain('archived')
  })
})

describe('ISSUER_HOLDER_REVIEW_STATUS_OPTIONS', () => {
  it('includes the four canonical review states', () => {
    const values = ISSUER_HOLDER_REVIEW_STATUS_OPTIONS.map((o) => o.value)
    expect(values).toContain('pending')
    expect(values).toContain('approved')
    expect(values).toContain('rejected')
    expect(values).toContain('revoked')
  })
})
