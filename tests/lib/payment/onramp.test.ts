import { describe, expect, it } from 'vitest'
import {
  buildOnRampUrl,
  isUsingDefaultOnRampTemplate,
  onRampDefaults,
  resolveOnRampTemplate,
} from '@/lib/payment/onramp'

describe('payment on-ramp helpers', () => {
  it('falls back to the default template when no custom template is set', () => {
    const url = buildOnRampUrl('0xabc123', undefined)
    expect(url).toBe(`${onRampDefaults.template.replace('{address}', '0xabc123')}`)
  })

  it('replaces every {address} placeholder and encodes wallet address', () => {
    const url = buildOnRampUrl(
      '0xabc/def',
      'https://buy.example/checkout?wallet={address}&reference={address}',
    )

    expect(url).toBe(
      'https://buy.example/checkout?wallet=0xabc%2Fdef&reference=0xabc%2Fdef',
    )
  })

  it('appends walletAddress when custom template has no placeholder', () => {
    const url = buildOnRampUrl('0xabc123', 'https://buy.example/checkout')
    expect(url).toBe('https://buy.example/checkout?walletAddress=0xabc123')
  })

  it('appends walletAddress with ampersand when query params already exist', () => {
    const url = buildOnRampUrl('0xabc123', 'https://buy.example/checkout?network=base')
    expect(url).toBe('https://buy.example/checkout?network=base&walletAddress=0xabc123')
  })

  it('detects whether the app is using the default provider template', () => {
    expect(isUsingDefaultOnRampTemplate(undefined)).toBe(true)
    expect(isUsingDefaultOnRampTemplate('   ')).toBe(true)
    expect(isUsingDefaultOnRampTemplate('https://buy.example')).toBe(false)
  })

  it('resolves and trims custom template values', () => {
    expect(resolveOnRampTemplate('  https://buy.example/checkout  ')).toBe('https://buy.example/checkout')
    expect(resolveOnRampTemplate('')).toBe(onRampDefaults.template)
  })
})
