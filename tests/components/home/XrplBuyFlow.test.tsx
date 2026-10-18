// @vitest-environment jsdom

import { act, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import XrplBuyFlow from '@/components/home/XrplBuyFlow.client'
import { useDynamicInfoStore } from '@/hooks/useDynamicInfoStore'
import { useXrplNetworkStore } from '@/infra/state/xrplNetworkStore'

const { mockUnlockLocalXrplSigner, mockSignAndSubmitLocalXrplTrustline } = vi.hoisted(() => ({
  mockUnlockLocalXrplSigner: vi.fn(),
  mockSignAndSubmitLocalXrplTrustline: vi.fn(),
}))

vi.mock('@/lib/xrpl/local-wallet', () => ({
  unlockLocalXrplSigner: mockUnlockLocalXrplSigner,
}))
vi.mock('@/lib/xrpl/local-trustline', () => ({
  signAndSubmitLocalXrplTrustline: mockSignAndSubmitLocalXrplTrustline,
}))

const account = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh'
const issuer = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'
const secondIssuer = 'rDsbeomae4FXwgQTJp9Rs64Qg9vDiTCdBv'
const initialState = useDynamicInfoStore.getState()
const initialNetworkState = useXrplNetworkStore.getState()

function missingTrustlineResponse() {
  return {
    ok: false,
    status: 400,
    headers: new Headers(),
    json: async () => ({
      ok: false,
      code: 'swap_prepare_failed',
      error: 'No trusted EURC trustline is configured in this wallet on Testnet.',
    }),
  }
}

function readyTrustlineResponse(network = 'testnet', selectedIssuer = issuer) {
  return {
    ok: true,
    json: async () => ({
      ok: true,
      type: 'ready',
      network,
      account,
      issuer: selectedIssuer,
      currency: 'EURC',
      limit: '100',
      transaction: {
        TransactionType: 'TrustSet',
        Account: account,
        LimitAmount: { currency: 'EURC', issuer: selectedIssuer, value: '100' },
      },
    }),
  }
}

describe('XrplBuyFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    useXrplNetworkStore.setState({ selectedNetworkId: 'testnet' })
    useDynamicInfoStore.setState((state) => ({
      wallet: { ...state.wallet, xrplAddress: account },
    }))
    mockUnlockLocalXrplSigner.mockResolvedValue({ classicAddress: account })
    mockSignAndSubmitLocalXrplTrustline.mockResolvedValue({
      hash: 'trustline-hash',
      engineResult: 'tesSUCCESS',
      validated: true,
      ledgerIndex: 123,
    })
  })

  afterEach(() => {
    useDynamicInfoStore.setState(initialState, true)
    useXrplNetworkStore.setState(initialNetworkState, true)
    vi.unstubAllGlobals()
  })

  it('offers customer-signed trustline setup when the wallet has no trustline', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        headers: new Headers(),
        json: async () => ({
          ok: false,
          code: 'swap_prepare_failed',
          error: 'No trusted EURC trustline is configured in this wallet on Testnet.',
        }),
      }),
    )

    const { getByTestId, findByTestId } = render(
      <XrplBuyFlow asset={{ symbol: 'EURC', name: 'EURC' }} />,
    )
    fireEvent.click(getByTestId('xrpl-buy-get-quote'))

    expect(await findByTestId('xrpl-buy-trustline-setup')).toBeTruthy()
    expect(getByTestId('xrpl-buy-error').textContent).toContain('trustline')
    expect(getByTestId('xrpl-buy-trustline-limit')).toBeTruthy()
  })

  it('shows the reviewed issuer and limit before the user signs a trustline', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce(missingTrustlineResponse())
        .mockResolvedValueOnce(readyTrustlineResponse()),
    )

    const { getByTestId, findByTestId } = render(
      <XrplBuyFlow asset={{ symbol: 'EURC', name: 'EURC' }} />,
    )
    fireEvent.click(getByTestId('xrpl-buy-get-quote'))
    await waitFor(() => {
      expect(getByTestId('xrpl-buy-trustline-setup')).toBeTruthy()
    })
    fireEvent.change(getByTestId('xrpl-buy-trustline-limit'), { target: { value: '100' } })
    fireEvent.click(getByTestId('xrpl-buy-trustline-prepare'))

    expect(await findByTestId('xrpl-buy-trustline-review')).toBeTruthy()
    expect(getByTestId('xrpl-buy-trustline-review').textContent).toContain(issuer)
    expect(getByTestId('xrpl-buy-trustline-review').textContent).toContain('100 EURC')
  })

  it('requires an issuer choice when multiple issuers are trusted', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(missingTrustlineResponse())
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          type: 'selection-required',
          issuers: [issuer, secondIssuer],
        }),
      })
      .mockResolvedValueOnce(readyTrustlineResponse('testnet', secondIssuer))
    vi.stubGlobal('fetch', fetchMock)

    const { getByTestId, findByTestId } = render(
      <XrplBuyFlow asset={{ symbol: 'EURC', name: 'EURC' }} />,
    )
    fireEvent.click(getByTestId('xrpl-buy-get-quote'))
    await findByTestId('xrpl-buy-trustline-setup')
    fireEvent.change(getByTestId('xrpl-buy-trustline-limit'), { target: { value: '100' } })
    fireEvent.click(getByTestId('xrpl-buy-trustline-prepare'))

    const issuerSelect = await findByTestId('xrpl-buy-trustline-issuer')
    fireEvent.change(issuerSelect, { target: { value: secondIssuer } })
    fireEvent.click(getByTestId('xrpl-buy-trustline-prepare'))

    expect(await findByTestId('xrpl-buy-trustline-review')).toBeTruthy()
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toMatchObject({
      issuer: secondIssuer,
      limit: '100',
    })
  })

  it('reports an existing trustline without preparing a duplicate', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce(missingTrustlineResponse())
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            ok: true,
            type: 'already-exists',
            network: 'testnet',
            issuer,
            currency: 'EURC',
            currentLimit: '200',
            balance: '0',
          }),
        }),
    )

    const { getByTestId, findByTestId, queryByTestId } = render(
      <XrplBuyFlow asset={{ symbol: 'EURC', name: 'EURC' }} />,
    )
    fireEvent.click(getByTestId('xrpl-buy-get-quote'))
    await findByTestId('xrpl-buy-trustline-setup')
    fireEvent.change(getByTestId('xrpl-buy-trustline-limit'), { target: { value: '100' } })
    fireEvent.click(getByTestId('xrpl-buy-trustline-prepare'))

    expect(await findByTestId('xrpl-buy-error')).toBeTruthy()
    expect(queryByTestId('xrpl-buy-trustline-review')).toBeNull()
    expect(mockSignAndSubmitLocalXrplTrustline).not.toHaveBeenCalled()
  })

  it('requires explicit acknowledgement before submitting a mainnet TrustSet', async () => {
    useXrplNetworkStore.setState({ selectedNetworkId: 'mainnet' })
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce(missingTrustlineResponse())
        .mockResolvedValueOnce(readyTrustlineResponse('mainnet')),
    )

    const { getByTestId, findByTestId } = render(
      <XrplBuyFlow asset={{ symbol: 'EURC', name: 'EURC' }} />,
    )
    fireEvent.click(getByTestId('xrpl-buy-get-quote'))
    await findByTestId('xrpl-buy-trustline-setup')
    fireEvent.change(getByTestId('xrpl-buy-trustline-limit'), { target: { value: '100' } })
    fireEvent.click(getByTestId('xrpl-buy-trustline-prepare'))
    await findByTestId('xrpl-buy-trustline-review')
    fireEvent.change(getByTestId('xrpl-buy-trustline-password'), {
      target: { value: 'wallet-password' },
    })

    const confirm = getByTestId('xrpl-buy-trustline-confirm') as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    fireEvent.submit(getByTestId('xrpl-buy-trustline-review'))
    expect(mockUnlockLocalXrplSigner).not.toHaveBeenCalled()
    expect(getByTestId('xrpl-buy-error')).toBeTruthy()

    fireEvent.click(getByTestId('xrpl-buy-trustline-mainnet-acknowledgement'))
    expect(confirm.disabled).toBe(false)
  })

  it('clears the password after a failed TrustSet attempt', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce(missingTrustlineResponse())
        .mockResolvedValueOnce(readyTrustlineResponse()),
    )
    mockSignAndSubmitLocalXrplTrustline.mockRejectedValueOnce(new Error('Submission failed'))
    sessionStorage.setItem('aljama.encryptedWallet', 'encrypted-wallet')

    const { getByTestId, findByTestId } = render(
      <XrplBuyFlow asset={{ symbol: 'EURC', name: 'EURC' }} />,
    )
    fireEvent.click(getByTestId('xrpl-buy-get-quote'))
    await findByTestId('xrpl-buy-trustline-setup')
    fireEvent.change(getByTestId('xrpl-buy-trustline-limit'), { target: { value: '100' } })
    fireEvent.click(getByTestId('xrpl-buy-trustline-prepare'))
    await findByTestId('xrpl-buy-trustline-review')
    fireEvent.change(getByTestId('xrpl-buy-trustline-password'), {
      target: { value: 'wallet-password' },
    })

    await act(async () => {
      fireEvent.click(getByTestId('xrpl-buy-trustline-confirm'))
    })

    expect((getByTestId('xrpl-buy-trustline-password') as HTMLInputElement).value).toBe('')
    expect(getByTestId('xrpl-buy-error')).toBeTruthy()
  })

  it('submits a TrustSet and allows a fresh quote after success', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(missingTrustlineResponse())
      .mockResolvedValueOnce(readyTrustlineResponse())
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          network: 'testnet',
          account,
          quote: {
            sourceAmount: { currency: 'XRP', value: '10' },
            quotedSourceAmount: { currency: 'XRP', value: '10' },
            destinationAmount: { currency: 'EURC', issuer, value: '20' },
            deliverMin: { currency: 'EURC', issuer, value: '19' },
            pathCount: 1,
            alternativeCount: 0,
            fullReply: false,
            slippageBps: 500,
          },
          transaction: {
            TransactionType: 'Payment',
            Account: account,
            Destination: account,
            Flags: 0,
            Amount: '20',
            SendMax: '10',
            DeliverMin: '19',
          },
        }),
      })
    vi.stubGlobal('fetch', fetchMock)
    sessionStorage.setItem('aljama.encryptedWallet', 'encrypted-wallet')

    const { getByTestId, findByTestId, queryByTestId } = render(
      <XrplBuyFlow asset={{ symbol: 'EURC', name: 'EURC' }} />,
    )
    fireEvent.click(getByTestId('xrpl-buy-get-quote'))
    await findByTestId('xrpl-buy-trustline-setup')
    fireEvent.change(getByTestId('xrpl-buy-trustline-limit'), { target: { value: '100' } })
    fireEvent.click(getByTestId('xrpl-buy-trustline-prepare'))
    await findByTestId('xrpl-buy-trustline-review')
    fireEvent.change(getByTestId('xrpl-buy-trustline-password'), {
      target: { value: 'wallet-password' },
    })
    await act(async () => {
      fireEvent.click(getByTestId('xrpl-buy-trustline-confirm'))
    })

    expect(await findByTestId('xrpl-buy-trustline-result')).toBeTruthy()
    expect(queryByTestId('xrpl-buy-trustline-password')).toBeNull()
    expect(mockSignAndSubmitLocalXrplTrustline).toHaveBeenCalledOnce()

    fireEvent.click(getByTestId('xrpl-buy-get-quote'))
    expect(await findByTestId('xrpl-buy-review')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
