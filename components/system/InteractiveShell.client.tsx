'use client'

import { useEffect, useState, type ReactNode } from 'react'

type InteractiveShellProps = {
  children: ReactNode
  loadingTitle: string
  loadingHint: string
  className?: string
  overlayClassName?: string
  panelClassName?: string
  rootTestId?: string
  loadingTestId?: string
}

export default function InteractiveShell({
  children,
  loadingTitle,
  loadingHint,
  className,
  overlayClassName,
  panelClassName,
  rootTestId,
  loadingTestId,
}: InteractiveShellProps) {
  const [interactiveReady, setInteractiveReady] = useState(false)

  useEffect(() => {
    let readyTimeout = 0
    const scheduleFrame =
      typeof window.requestAnimationFrame === 'function'
        ? window.requestAnimationFrame.bind(window)
        : (callback: FrameRequestCallback) =>
            window.setTimeout(() => callback(Date.now()), 16)
    const cancelFrame =
      typeof window.cancelAnimationFrame === 'function'
        ? window.cancelAnimationFrame.bind(window)
        : window.clearTimeout.bind(window)

    let firstFrame = 0
    let secondFrame = 0
    const markInteractive = () => {
      window.clearTimeout(readyTimeout)
      setInteractiveReady(true)
    }

    readyTimeout = window.setTimeout(markInteractive, 1_500)
    firstFrame = scheduleFrame(() => {
      secondFrame = scheduleFrame(() => {
        markInteractive()
      })
    })

    return () => {
      window.clearTimeout(readyTimeout)
      cancelFrame(firstFrame)
      cancelFrame(secondFrame)
    }
  }, [])

  return (
    <div
      data-testid={rootTestId}
      data-interactive-ready={interactiveReady ? 'true' : 'false'}
      aria-busy={!interactiveReady}
      className={className}
    >
      {children}
      {!interactiveReady ? (
        <div
          data-testid={loadingTestId}
          className={
            overlayClassName ??
            'pointer-events-none absolute inset-0 z-20 bg-black/18 backdrop-blur-[2px]'
          }
        >
          <div
            role="status"
            aria-live="polite"
            className={
              panelClassName ??
              'ms-auto me-4 mt-4 max-w-xs rounded-2xl border border-white/10 bg-[#071018]/92 px-4 py-3 text-start shadow-xl shadow-black/25'
            }
          >
            <div className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="mt-1 h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/15 border-t-saffron"
              />
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-saffron/80">
                  {loadingTitle}
                </p>
                <p className="mt-2 text-sm leading-6 text-ivory/72">{loadingHint}</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
