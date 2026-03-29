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

    firstFrame = scheduleFrame(() => {
      secondFrame = scheduleFrame(() => {
        setInteractiveReady(true)
      })
    })

    return () => {
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
            'absolute inset-0 z-20 bg-black/18 backdrop-blur-[2px]'
          }
        >
          <div
            role="status"
            aria-live="polite"
            className={
              panelClassName ??
              'ml-auto mt-4 mr-4 max-w-xs rounded-2xl border border-white/10 bg-[#071018]/92 px-4 py-3 text-left shadow-xl shadow-black/25'
            }
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-saffron/80">
              {loadingTitle}
            </p>
            <p className="mt-2 text-sm leading-6 text-ivory/72">{loadingHint}</p>
          </div>
        </div>
      ) : null}
    </div>
  )
}
