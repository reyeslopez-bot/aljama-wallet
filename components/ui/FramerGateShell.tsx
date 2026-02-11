"use client"

import * as React from "react"

type Props = {
  title: string
  subtitle: string
  children: React.ReactNode
  rightPanel?: React.ReactNode
}

export default function FramerGateShell({ title, subtitle, children, rightPanel }: Props) {
  return (
    <div className="relative mx-auto flex min-h-[70vh] max-w-6xl items-center justify-center px-6 py-16">
      {/* background */}
      <div className="pointer-events-none absolute inset-0 bg-[#07090c]" />
      <div className="pointer-events-none absolute -inset-[30%] bg-[radial-gradient(closest-side_at_50%_35%,rgba(210,167,98,0.10),rgba(255,255,255,0.00)_62%)]" />
      <div className="pointer-events-none absolute left-1/2 top-[40%] h-[720px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle_at_60%_40%,rgba(78,120,160,0.16),rgba(0,0,0,0)_60%)] blur-[20px]" />

      <section className="surface-panel panel-glow-saffron relative w-full max-w-[1100px] overflow-hidden rounded-[2.5rem]">
        <div className="absolute inset-x-10 top-6 ornament-line" />

        <div className="relative grid gap-12 p-10 lg:grid-cols-[1.2fr_1fr]">
          <div className="space-y-6">
            <div className="text-center lg:text-left">
              <div className="mx-auto mb-4 grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-white/5 lg:mx-0">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M12 2l8 4v6c0 5-3.2 9.7-8 10-4.8-.3-8-5-8-10V6l8-4z"
                    stroke="rgba(255,255,255,0.9)"
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <h1 className="font-display text-4xl font-semibold tracking-tight text-ivory">{title}</h1>
              <p className="mt-2 text-sm text-ivory/70">{subtitle}</p>
            </div>

            {children}
          </div>

          {rightPanel ? (
            <div className="surface-inner relative p-6">
              {rightPanel}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  )
}
