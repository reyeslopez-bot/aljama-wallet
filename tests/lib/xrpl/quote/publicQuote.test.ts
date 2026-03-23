import { beforeEach, describe, expect, it, vi } from 'vitest'

const USD_ISSUER = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'
const USDT_ISSUER = 'rUSDT1111111111111111111111111111111'

describe('lib/xrpl/quote/publicQuote', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
  })

  it('selects the better AMM quote when it beats the orderbook', async () => {
    vi.stubEnv('XRPL_TRADE_TRUSTED_ISSUERS', JSON.stringify({ USD: [USD_ISSUER] }))

    const request = vi.fn(async (payload: Record<string, unknown>) => {
      if (payload.command === 'amm_info') {
        return {
          result: {
            amm: {
              account: 'rAmm',
              amount: '1000000000',
              amount2: { currency: 'USD', issuer: USD_ISSUER, value: '1200' },
              lp_token: { currency: '03AA', issuer: 'rAmm', value: '100' },
              trading_fee: 0,
            },
          },
        }
      }

      if (payload.command === 'book_offers') {
        return {
          result: {
            offers: [
              {
                TakerGets: { currency: 'USD', issuer: USD_ISSUER, value: '50' },
                TakerPays: '50000000',
              },
            ],
          },
        }
      }

      throw new Error(`Unexpected XRPL request: ${String(payload.command)}`)
    })

    const { getPublicXrplSwapQuote } = await import('@/lib/xrpl/quote/publicQuote')
    const quote = await getPublicXrplSwapQuote({
      client: { request } as any,
      networkId: 'testnet',
      sourceAmount: { currency: 'XRP', value: '50' },
      destinationAsset: { currency: 'USD' },
    })

    expect(quote.quoteMode).toBe('public')
    expect(quote.liquiditySource).toBe('amm')
    expect(quote.routeKind).toBe('direct')
    expect(quote.destinationAmount.issuer).toBe(USD_ISSUER)
    expect(quote.destinationAmount.value).toBe('57.142857142857142857')
  })

  it('uses the orderbook when no AMM exists for the pair', async () => {
    vi.stubEnv('XRPL_TRADE_TRUSTED_ISSUERS', JSON.stringify({ USD: [USD_ISSUER] }))

    const request = vi.fn(async (payload: Record<string, unknown>) => {
      if (payload.command === 'amm_info') {
        throw {
          name: 'RippledError',
          message: 'Account not found.',
          data: { error: 'actNotFound', error_message: 'Account not found.' },
        }
      }

      if (payload.command === 'book_offers') {
        return {
          result: {
            offers: [
              {
                TakerGets: { currency: 'USD', issuer: USD_ISSUER, value: '45.5' },
                TakerPays: '50000000',
              },
            ],
          },
        }
      }

      throw new Error(`Unexpected XRPL request: ${String(payload.command)}`)
    })

    const { getPublicXrplSwapQuote } = await import('@/lib/xrpl/quote/publicQuote')
    const quote = await getPublicXrplSwapQuote({
      client: { request } as any,
      networkId: 'testnet',
      sourceAmount: { currency: 'XRP', value: '50' },
      destinationAsset: { currency: 'USD' },
    })

    expect(quote.liquiditySource).toBe('orderbook')
    expect(quote.destinationAmount.value).toBe('45.5')
    expect(quote.deliverMin.value).toBe('45.2725')
  })

  it('builds a one-intermediate public route when direct liquidity is missing', async () => {
    vi.stubEnv('XRPL_TRADE_TRUSTED_ISSUERS', JSON.stringify({ USD: [USD_ISSUER] }))
    vi.stubEnv(
      'XRPL_PUBLIC_QUOTE_INTERMEDIATES',
      JSON.stringify([{ currency: 'USDT', issuer: USDT_ISSUER }]),
    )

    const request = vi.fn(async (payload: Record<string, any>) => {
      if (payload.command === 'amm_info') {
        throw {
          name: 'RippledError',
          message: 'Account not found.',
          data: { error: 'actNotFound', error_message: 'Account not found.' },
        }
      }

      if (payload.command === 'book_offers') {
        const takerGets = payload.taker_gets
        const takerPays = payload.taker_pays

        if (takerGets.currency === 'USD' && takerPays.currency === 'XRP') {
          return { result: { offers: [] } }
        }
        if (takerGets.currency === 'USDT' && takerPays.currency === 'XRP') {
          return {
            result: {
              offers: [
                {
                  TakerGets: { currency: 'USDT', issuer: USDT_ISSUER, value: '60' },
                  TakerPays: '50000000',
                },
              ],
            },
          }
        }
        if (takerGets.currency === 'USD' && takerPays.currency === 'USDT') {
          return {
            result: {
              offers: [
                {
                  TakerGets: { currency: 'USD', issuer: USD_ISSUER, value: '58' },
                  TakerPays: { currency: 'USDT', issuer: USDT_ISSUER, value: '60' },
                },
              ],
            },
          }
        }
      }

      throw new Error(`Unexpected XRPL request: ${JSON.stringify(payload)}`)
    })

    const { getPublicXrplSwapQuote } = await import('@/lib/xrpl/quote/publicQuote')
    const quote = await getPublicXrplSwapQuote({
      client: { request } as any,
      networkId: 'testnet',
      sourceAmount: { currency: 'XRP', value: '50' },
      destinationAsset: { currency: 'USD' },
    })

    expect(quote.quoteMode).toBe('public')
    expect(quote.liquiditySource).toBe('multi_hop')
    expect(quote.routeKind).toBe('multi_hop')
    expect(quote.destinationAmount.value).toBe('58')
    expect(quote.hops).toEqual([
      {
        from: { currency: 'XRP', issuer: undefined },
        to: { currency: 'USDT', issuer: USDT_ISSUER },
        liquiditySource: 'orderbook',
      },
      {
        from: { currency: 'USDT', issuer: USDT_ISSUER },
        to: { currency: 'USD', issuer: USD_ISSUER },
        liquiditySource: 'orderbook',
      },
    ])
  })
})
