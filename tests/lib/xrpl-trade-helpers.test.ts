import { describe, it, expect } from 'vitest'
import {
  parseCsv,
  shortHash,
  isMissingSignerConfig,
  looksLikeClassicAddress,
  parsePositiveAmount,
  formatPreviewAmount,
  explorerTransactionUrl,
  formatAssetSelection,
} from '@/lib/xrpl-trade-helpers'

describe('parseCsv', () => {
  it('returns an empty set for undefined', () => {
    expect(parseCsv(undefined).size).toBe(0)
  })

  it('returns an empty set for an empty string', () => {
    expect(parseCsv('').size).toBe(0)
  })

  it('parses a single value', () => {
    expect(parseCsv('foo')).toEqual(new Set(['foo']))
  })

  it('parses multiple comma-separated values', () => {
    expect(parseCsv('foo,bar,baz')).toEqual(new Set(['foo', 'bar', 'baz']))
  })

  it('trims whitespace and lowercases each value', () => {
    expect(parseCsv(' FOO , Bar , BAZ ')).toEqual(new Set(['foo', 'bar', 'baz']))
  })

  it('filters out empty segments', () => {
    expect(parseCsv(',,foo,,')).toEqual(new Set(['foo']))
  })

  it('deduplicates values', () => {
    expect(parseCsv('a,a,b')).toEqual(new Set(['a', 'b']))
  })
})

describe('shortHash', () => {
  it('returns "--" for null', () => {
    expect(shortHash(null)).toBe('--')
  })

  it('returns "--" for undefined', () => {
    expect(shortHash(undefined)).toBe('--')
  })

  it('returns the value unchanged when 18 chars or fewer', () => {
    expect(shortHash('abc')).toBe('abc')
    expect(shortHash('123456789012345678')).toBe('123456789012345678')
  })

  it('truncates values longer than 18 chars', () => {
    const hash = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'
    const result = shortHash(hash)
    expect(result).toMatch(/^rPT1Sjq2\.\.\./)
    expect(result).toMatch(/bpAYe$/)
  })

  it('shows first 8 and last 8 chars separated by "..."', () => {
    // 19 chars → longer than threshold of 18
    const hash = '123456789012345678A'
    const result = shortHash(hash)
    expect(result).toBe('12345678...2345678A')
  })
})

describe('isMissingSignerConfig', () => {
  it('returns true for the canonical error message', () => {
    expect(isMissingSignerConfig('Missing XRPL signer seed')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(isMissingSignerConfig('MISSING XRPL SIGNER SEED')).toBe(true)
    expect(isMissingSignerConfig('missing xrpl signer seed')).toBe(true)
  })

  it('returns false for unrelated messages', () => {
    expect(isMissingSignerConfig('Connection refused')).toBe(false)
    expect(isMissingSignerConfig('')).toBe(false)
  })
})

describe('looksLikeClassicAddress', () => {
  it('accepts valid classic addresses', () => {
    expect(looksLikeClassicAddress('rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe')).toBe(true)
    expect(looksLikeClassicAddress('r9cZA1mLK5R5Am25ArfXFmqgNwjZgnfk59')).toBe(true)
  })

  it('rejects addresses that do not start with r', () => {
    expect(looksLikeClassicAddress('0xabcdef1234')).toBe(false)
  })

  it('rejects addresses that are too short', () => {
    expect(looksLikeClassicAddress('rShort')).toBe(false)
  })

  it('rejects empty string', () => {
    expect(looksLikeClassicAddress('')).toBe(false)
  })

  it('trims leading/trailing whitespace before testing', () => {
    expect(looksLikeClassicAddress('  rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe  ')).toBe(true)
  })
})

describe('parsePositiveAmount', () => {
  it('returns a valid positive number', () => {
    expect(parsePositiveAmount('10')).toBe(10)
    expect(parsePositiveAmount('0.001')).toBeCloseTo(0.001)
  })

  it('returns null for zero', () => {
    expect(parsePositiveAmount('0')).toBeNull()
  })

  it('returns null for negative values', () => {
    expect(parsePositiveAmount('-5')).toBeNull()
  })

  it('returns null for non-numeric strings', () => {
    expect(parsePositiveAmount('abc')).toBeNull()
    expect(parsePositiveAmount('')).toBeNull()
  })

  it('returns null for Infinity', () => {
    expect(parsePositiveAmount('Infinity')).toBeNull()
  })
})

describe('formatPreviewAmount', () => {
  it('returns "--" for Infinity', () => {
    expect(formatPreviewAmount(Infinity)).toBe('--')
  })

  it('returns "--" for NaN', () => {
    expect(formatPreviewAmount(NaN)).toBe('--')
  })

  it('strips trailing zeros', () => {
    expect(formatPreviewAmount(1)).toBe('1')
    expect(formatPreviewAmount(1.5)).toBe('1.5')
    expect(formatPreviewAmount(1.23456)).toBe('1.23456')
  })

  it('formats small values with up to 6 decimal places', () => {
    expect(formatPreviewAmount(0.000001)).toBe('0.000001')
  })

  it('rounds at 6 decimal places', () => {
    expect(formatPreviewAmount(1.1234567)).toBe('1.123457')
  })
})

describe('explorerTransactionUrl', () => {
  it('builds a correct testnet URL', () => {
    const url = explorerTransactionUrl('testnet', 'DEADBEEF')
    expect(url).toBe('https://testnet.xrpl.org/transactions/DEADBEEF')
  })

  it('builds a correct mainnet URL', () => {
    const url = explorerTransactionUrl('mainnet', 'ABCD1234')
    expect(url).toBe('https://livenet.xrpl.org/transactions/ABCD1234')
  })

  it('strips trailing slashes from the explorer base', () => {
    // xahau-testnet has a trailing slash in its explorerUrl
    const url = explorerTransactionUrl('xahau-testnet', 'TX123')
    expect(url).not.toMatch(/\/\/transactions/)
    expect(url).toContain('/transactions/TX123')
  })
})

describe('formatAssetSelection', () => {
  it('returns just the currency code for XRP', () => {
    expect(formatAssetSelection('XRP', '')).toBe('XRP')
    expect(formatAssetSelection('xrp', '')).toBe('XRP')
  })

  it('returns the currency code with a shortened issuer in parens', () => {
    const issuer = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'
    const result = formatAssetSelection('USD', issuer)
    expect(result).toMatch(/^USD \(/)
    expect(result).toMatch(/\)$/)
  })

  it('uppercases the currency code', () => {
    const result = formatAssetSelection('usd', 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe')
    expect(result.startsWith('USD')).toBe(true)
  })

  it('returns just the code when issuer is empty and currency is not XRP', () => {
    expect(formatAssetSelection('EUR', '')).toBe('EUR')
  })
})
