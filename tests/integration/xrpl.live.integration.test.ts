import { afterAll, describe, expect, it } from 'vitest'
import { getXrplClient, resetXrplClientsForTests } from '@/infra/xrpl/client'
import {
  DEFAULT_XRPL_NETWORK_ID,
  isXrplNetworkId,
  type XrplNetworkId,
} from '@/lib/xrpl-networks'

const RUN_XRPL_LIVE_TESTS = process.env.RUN_XRPL_INTEGRATION_TESTS === 'true'
const describeLive = RUN_XRPL_LIVE_TESTS ? describe : describe.skip

const requestedNetwork = process.env.XRPL_INTEGRATION_NETWORK_ID
const NETWORK_ID: XrplNetworkId =
  requestedNetwork && isXrplNetworkId(requestedNetwork)
    ? requestedNetwork
    : DEFAULT_XRPL_NETWORK_ID

const REQUEST_TIMEOUT_MS = Math.max(500, Number(process.env.XRPL_INTEGRATION_REQUEST_TIMEOUT_MS ?? 8_000))
const LATENCY_BUDGET_MS = Math.max(1_000, Number(process.env.XRPL_INTEGRATION_LATENCY_BUDGET_MS ?? 20_000))
const LEDGER_SAMPLE_SIZE = Math.max(3, Number(process.env.XRPL_INTEGRATION_LEDGER_SAMPLES ?? 4))
const FUZZ_CASES = Math.max(4, Number(process.env.XRPL_INTEGRATION_FUZZ_CASES ?? 8))
const FUZZ_SEED = Number(process.env.XRPL_INTEGRATION_FUZZ_SEED ?? 17_031)

type XrplResponseLike = { result?: Record<string, unknown> }
type XrplRequestPayload = Record<string, unknown>

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label}_timeout_after_${timeoutMs}ms`))
    }, timeoutMs)

    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function parseLedgerIndex(response: unknown): number {
  const result = ((response as XrplResponseLike).result ?? {})
  const info = (result.info as Record<string, unknown> | undefined) ?? {}
  const validatedLedger = (info.validated_ledger as Record<string, unknown> | undefined) ?? {}

  const candidates = [
    validatedLedger.seq,
    info.validated_ledger_seq,
    result.ledger_current_index,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate
    }
    if (typeof candidate === 'string' && candidate.trim()) {
      const parsed = Number(candidate)
      if (Number.isFinite(parsed)) {
        return parsed
      }
    }
  }

  throw new Error('Unable to parse validated ledger index from XRPL response')
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0
    return state / 4_294_967_296
  }
}

function randomHex(next: () => number, length: number): string {
  const alphabet = 'abcdef0123456789'
  let output = ''
  for (let index = 0; index < length; index += 1) {
    output += alphabet[Math.floor(next() * alphabet.length)]!
  }
  return output
}

function randomInvalidAddress(next: () => number): string {
  return `r${randomHex(next, 11)}`
}

function randomInvalidCurrency(next: () => number): string {
  const alphabet = 'XYZ!@$012'
  let output = ''
  for (let index = 0; index < 3; index += 1) {
    output += alphabet[Math.floor(next() * alphabet.length)]!
  }
  return output
}

function buildMalformedRequest(next: () => number, index: number): XrplRequestPayload {
  switch (index % 4) {
    case 0:
      return {
        command: 'account_info',
        account: randomInvalidAddress(next),
        ledger_index: 'validated',
      }
    case 1:
      return {
        command: 'book_offers',
        taker_gets: { currency: randomInvalidCurrency(next) },
        taker_pays: { currency: 'XRP' },
        limit: -5,
      }
    case 2:
      return {
        command: 'account_lines',
        account: randomInvalidAddress(next),
        limit: -1,
      }
    default:
      return {
        command: 'submit',
        tx_blob: randomHex(next, 7),
      }
  }
}

function isErrorLikeXrplResponse(response: unknown): boolean {
  const result = ((response as XrplResponseLike).result ?? {})
  if (typeof result.status === 'string' && result.status.toLowerCase() === 'error') return true
  if (result.error) return true

  const engineResult = result.engine_result
  if (typeof engineResult === 'string' && engineResult !== 'tesSUCCESS') return true

  if (result.accepted === false) return true
  return false
}

describeLive('XRPL live integration', () => {
  afterAll(async () => {
    await resetXrplClientsForTests()
  })

  it('serves server_info within timeout and latency budget', async () => {
    const client = await getXrplClient(NETWORK_ID)
    const startedAt = Date.now()

    const response = await withTimeout(
      client.request({ command: 'server_info' }),
      REQUEST_TIMEOUT_MS,
      'server_info',
    )

    expect((response as XrplResponseLike).result).toBeTruthy()
    expect(Date.now() - startedAt).toBeLessThan(LATENCY_BUDGET_MS)
  })

  it('surfaces timeout behavior for slow XRPL requests', async () => {
    const client = await getXrplClient(NETWORK_ID)

    await expect(
      withTimeout(
        client.request({ command: 'server_info' }),
        1,
        'server_info',
      ),
    ).rejects.toThrow(/timeout/i)
  })

  it('recovers after disconnect and reconnect', async () => {
    const firstClient = await getXrplClient(NETWORK_ID)
    expect(firstClient.isConnected()).toBe(true)

    await firstClient.disconnect()
    expect(firstClient.isConnected()).toBe(false)

    const secondClient = await getXrplClient(NETWORK_ID)
    expect(secondClient.isConnected()).toBe(true)
  })

  it('rejects malformed transaction payloads', async () => {
    const client = await getXrplClient(NETWORK_ID)

    const malformedDetected = await withTimeout(
      client.request({
        command: 'submit',
        tx_blob: '00',
      }),
      REQUEST_TIMEOUT_MS,
      'submit',
    )
      .then((response) => isErrorLikeXrplResponse(response))
      .catch((error) => {
        const message = String(error).toLowerCase()
        return (
          message.includes('malformed') ||
          message.includes('invalid') ||
          message.includes('submit') ||
          message.includes('tx') ||
          message.includes('blob')
        )
      })

    expect(malformedDetected).toBe(true)
  })

  it('keeps validated ledger indexes monotonic across sequential polls', async () => {
    const client = await getXrplClient(NETWORK_ID)
    const samples: number[] = []

    for (let index = 0; index < LEDGER_SAMPLE_SIZE; index += 1) {
      const response = await withTimeout(
        client.request({ command: 'server_info' }),
        REQUEST_TIMEOUT_MS,
        'ledger_sample',
      )
      samples.push(parseLedgerIndex(response))
      await sleep(350)
    }

    for (let index = 1; index < samples.length; index += 1) {
      expect(samples[index]!).toBeGreaterThanOrEqual(samples[index - 1]!)
    }
  })

  it('handles Monte Carlo malformed request fuzz cases without unexpected success', async () => {
    const client = await getXrplClient(NETWORK_ID)
    const next = createSeededRandom(FUZZ_SEED)
    const requests = Array.from({ length: FUZZ_CASES }, (_, index) =>
      buildMalformedRequest(next, index),
    )

    const settled = await Promise.allSettled(
      requests.map((payload) =>
        withTimeout(
          client.request(payload as Parameters<typeof client.request>[0]),
          REQUEST_TIMEOUT_MS,
          'fuzz_request',
        ),
      ),
    )

    let unexpectedSuccesses = 0
    for (const item of settled) {
      if (item.status === 'rejected') {
        continue
      }
      if (!isErrorLikeXrplResponse(item.value)) {
        unexpectedSuccesses += 1
      }
    }

    expect(unexpectedSuccesses).toBe(0)
  })
})
