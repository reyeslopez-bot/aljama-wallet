'use client'

import { useEffect, useRef, useCallback } from 'react'
import { buildMoonPayUrl, type MoonPayMode } from '@/lib/payment/moonpay'

type MoonPayEvent =
  | { type: 'moonpay:order_created'; data: { id: string; status: string } }
  | { type: 'moonpay:order_completed'; data: { id: string } }
  | { type: 'moonpay:close' }

type Props = {
  mode: MoonPayMode
  apiKey: string
  walletAddress: string
  currencyCode?: string
  onClose: () => void
  onOrderComplete?: (orderId: string) => void
}

export default function MoonPayWidget({ mode, apiKey, walletAddress, currencyCode, onClose, onOrderComplete }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const url = buildMoonPayUrl(mode, apiKey, walletAddress, currencyCode)

  const handleMessage = useCallback((event: MessageEvent) => {
    let hostname: string
    try {
      hostname = new URL(event.origin).hostname
    } catch {
      return
    }
    if (hostname !== 'moonpay.com' && !hostname.endsWith('.moonpay.com')) return
    try {
      const msg = event.data as MoonPayEvent
      if (msg.type === 'moonpay:close') {
        onClose()
      } else if (msg.type === 'moonpay:order_completed') {
        onOrderComplete?.(msg.data.id)
        onClose()
      }
    } catch {
      // ignore malformed messages
    }
  }, [onClose, onOrderComplete])

  useEffect(() => {
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [handleMessage])

  function handleOverlayClick(event: React.MouseEvent<HTMLDivElement>) {
    if (event.target === overlayRef.current) onClose()
  }

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label={`MoonPay ${mode === 'buy' ? 'Buy' : 'Sell'} Crypto`}
      data-testid="moonpay-widget-overlay"
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
    >
      <div className="relative flex h-[680px] w-full max-w-[420px] flex-col overflow-hidden rounded-3xl border border-white/12 bg-[#0f0d0b] shadow-2xl shadow-black/60">
        <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-saffron/70">
              {mode === 'buy' ? 'Buy Crypto' : 'Sell Crypto'}
            </p>
            <p className="mt-0.5 text-sm font-semibold text-ivory">Powered by MoonPay</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close MoonPay widget"
            data-testid="moonpay-widget-close"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-ivory/60 transition hover:bg-white/10 hover:text-ivory"
          >
            ✕
          </button>
        </div>

        <iframe
          src={url}
          title={`MoonPay ${mode === 'buy' ? 'buy' : 'sell'} widget`}
          data-testid="moonpay-widget-iframe"
          allow="accelerometer; autoplay; camera; gyroscope; payment"
          className="h-full w-full border-0 bg-white"
          sandbox="allow-forms allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts allow-top-navigation-by-user-activation"
        />
      </div>
    </div>
  )
}
