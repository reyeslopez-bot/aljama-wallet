'use client'

import { useEffect, useState } from 'react'
import { useConnection, useConnect, useConnectors, useDisconnect } from 'wagmi'
import { useDynamicInfoStore } from '@/hooks/useDynamicInfoStore'
import { useComponentTelemetry } from '@/infra/telemetry/useComponentTelemetry'
import { useTranslations } from 'next-intl'
import { useSession } from 'next-auth/react'
import UnlockActionsLink from '@/components/ui/UnlockActionsLink.client'
import { useGsapPressable } from '@/hooks/useGsapPressable'

function formatShortAddress(address: string | undefined): string {
  if (!address) return '—'
  if (address.length <= 16) return address
  return `${address.slice(0, 8)}...${address.slice(-6)}`
}

export function ConnectWalletPanel() {
  useComponentTelemetry('ConnectWalletPanel')
  const t = useTranslations('connectWallet')
  const tInfo = useTranslations('infoCard')
  const { status: sessionStatus } = useSession()
  const locked = sessionStatus !== 'authenticated'
  const showUnlockMessage = sessionStatus === 'unauthenticated'
  const { address, isConnected, chain, connector: accountConnector } = useConnection()
  const connectors = useConnectors()
  const { mutate: connect, isPending, error: connectError } = useConnect()
  const { mutate: disconnect } = useDisconnect()
  const [hydrated, setHydrated] = useState(false)
  const setConnectWalletStatus = useDynamicInfoStore((s) => s.setConnectWalletStatus)
  const setConnectedWallet = useDynamicInfoStore((s) => s.setConnectedWallet)

  const readyConnectors = connectors.filter(
    (item) =>
      (item as { ready?: boolean }).ready !== false,
  )
  const injectedConnector = readyConnectors.find((item) => item.id === 'injected')
  const walletConnectConnector = readyConnectors.find((item) => item.id === 'walletConnect')
  const preferredConnector = injectedConnector ?? walletConnectConnector ?? readyConnectors[0]
  const canConnect = hydrated ? Boolean(preferredConnector) : true
  const displayConnected = hydrated ? isConnected : false
  const connectLabel = displayConnected ? t('buttonDisconnect') : t('buttonConnect')
  const activeAddress = displayConnected ? address : undefined
  const activeChainLabel = displayConnected
    ? chain?.name ?? (chain?.id ? `Chain ${chain.id}` : '—')
    : '—'
  const connectorLabel = displayConnected
    ? accountConnector?.name ?? preferredConnector?.name ?? '—'
    : preferredConnector?.name ?? t('status.noConnector')
  const statusLabel = !hydrated
    ? t('status.ready')
    : !canConnect
      ? t('status.noConnector')
      : displayConnected
        ? t('status.connected')
        : t('status.ready')
  const titleId = 'connect-wallet-title'
  const bodyId = 'connect-wallet-body'
  const statusId = 'connect-wallet-status'
  const detailId = 'connect-wallet-detail'
  const connectorNoteId = 'connect-wallet-connector-note'
  const errorId = 'connect-wallet-error'
  const actionButton = useGsapPressable<HTMLButtonElement>({
    hover: { scale: 1.02 },
    press: { scale: 0.98 },
  })

  useEffect(() => {
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated || locked || !isConnected || !address) {
      setConnectedWallet({ address: null })
      if (!isPending) setConnectWalletStatus('idle')
      return
    }

    setConnectedWallet({
      address,
      chainName: chain?.name ?? (chain?.id ? `Chain ${chain.id}` : null),
      connectorName: accountConnector?.name ?? null,
    })
    setConnectWalletStatus('success')
  }, [
    accountConnector?.name,
    address,
    chain?.id,
    chain?.name,
    hydrated,
    isConnected,
    isPending,
    setConnectedWallet,
    setConnectWalletStatus,
  ])

  return (
    <section
      data-testid="connect-wallet-panel"
      aria-labelledby={titleId}
      aria-describedby={`${bodyId} ${detailId}`}
      className="surface-panel panel-glow-lapis relative h-full p-7 sm:p-8"
    >
      <div className="absolute inset-x-8 top-5 ornament-line" />

      <header className="relative flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-saffron/70">{t('eyebrow')}</p>
          <h2 id={titleId} className="mt-3 font-display text-2xl font-semibold text-ivory sm:text-3xl">
            {t('title')}
          </h2>
          <p id={bodyId} className="text-sm text-ivory/70">
            {t('body')}
          </p>
        </div>
        <span
          id={statusId}
          data-testid="connect-wallet-status"
          aria-live="polite"
          className="rounded-full bg-white/5 px-3 py-1 text-xs font-semibold tracking-wide text-ivory/70"
        >
          {statusLabel}
        </span>
      </header>

      <div className="relative mt-6 space-y-4">
        <div
          data-testid="connect-wallet-summary"
          className="surface-soft rounded-2xl border border-white/10 bg-white/5 p-4 text-xs"
          role="group"
          aria-label={t('title')}
        >
          <div className="grid gap-2 text-ivory/75">
            <div className="flex items-center justify-between gap-3">
              <span className="text-ivory/50">{tInfo('wallet')}</span>
              <span className="font-mono text-ivory/85">{formatShortAddress(activeAddress)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-ivory/50">{tInfo('network')}</span>
              <span className="text-ivory/85">{activeChainLabel}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-ivory/50">{tInfo('connectionMethod')}</span>
              <span className="text-ivory/85">{connectorLabel}</span>
            </div>
          </div>
        </div>

        <div id={detailId} data-testid="connect-wallet-detail" className="surface-inner p-4" aria-live="polite">
          {displayConnected ? (
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.16em] text-jade/80">
                {t('linkedTitle')}
              </p>
              <p className="text-sm text-ivory/70">{t('linkedSubtitle')}</p>
              <p className="break-all font-mono text-sm text-jade">{address}</p>
            </div>
          ) : (
            <div className="space-y-2 text-sm text-ivory/70">
              <p className="flex items-center gap-2 font-medium text-saffron/80">
                <span className="h-2 w-2 rounded-full bg-saffron" />
                {t('emptyTitle')}
              </p>
              <p>{t('emptyBody')}</p>
            </div>
          )}
        </div>

        <button
          ref={actionButton.ref}
          data-testid="connect-wallet-action"
          type="button"
          onPointerEnter={actionButton.onPointerEnter}
          onPointerLeave={actionButton.onPointerLeave}
          onPointerDown={actionButton.onPointerDown}
          onPointerUp={actionButton.onPointerUp}
          onPointerCancel={actionButton.onPointerCancel}
          onBlur={actionButton.onBlur}
          disabled={locked || !canConnect || isPending}
          aria-describedby={[
            statusId,
            hydrated && !canConnect ? connectorNoteId : null,
            connectError ? errorId : null,
          ].filter(Boolean).join(' ') || undefined}
          aria-busy={isPending}
          onClick={() => {
            if (locked) return
            if (!preferredConnector) return
            if (displayConnected) {
              setConnectWalletStatus('pending')
              disconnect()
              return
            }
            setConnectWalletStatus('pending')
            connect({ connector: preferredConnector })
          }}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#7fb0d9] via-[#5c8db4] to-[#4b7c79] px-5 py-3 text-base font-semibold tracking-wide text-ivory shadow-lg shadow-[#4b7c79]/30 transition focus:outline-none focus:ring-2 focus:ring-lapis/40 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? t('buttonConnecting') : connectLabel}
        </button>

        {showUnlockMessage && (
          <UnlockActionsLink
            className="text-xs uppercase tracking-[0.18em] text-ivory/50"
          />
        )}

        {hydrated && !canConnect ? (
          <p id={connectorNoteId} data-testid="connect-wallet-no-connector-note" className="text-xs text-saffron/80">
            {t('noConnectorNote')}
          </p>
        ) : null}

        {connectError ? (
          <p id={errorId} data-testid="connect-wallet-error" role="alert" className="text-xs text-red-300">
            {connectError instanceof Error ? connectError.message : 'Wallet connection failed'}
          </p>
        ) : null}
      </div>
    </section>
  )
}
