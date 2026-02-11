"use client"

import * as React from "react"

type Props = {
  title?: string
  subtitle?: string
  buttonText?: string
  onUnlock?: (payload: { username: string; password: string }) => void
  showBackLink?: boolean
  backText?: string
  onBack?: () => void
}

export default function LoginGate({
  title = "Secure Gate",
  subtitle = "Enter username and password to continue",
  buttonText = "Access Content",
  onUnlock,
  showBackLink = true,
  backText = "Return to Home",
  onBack,
}: Props) {
  const [username, setUsername] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [showPw, setShowPw] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  const disabled = busy || !username || !password

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (disabled) return
    setBusy(true)
    try {
      onUnlock?.({ username, password })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative flex min-h-[520px] w-full items-center justify-center overflow-hidden bg-black/80 px-6 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(closest-side_at_50%_35%,rgba(210,167,98,0.12),rgba(255,255,255,0.00)_62%)]" />
      <div className="pointer-events-none absolute left-1/2 top-[40%] h-[720px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle_at_60%_40%,rgba(78,120,160,0.16),rgba(0,0,0,0)_60%)] blur-[20px]" />

      <div className="surface-panel panel-glow-saffron relative w-full max-w-xl rounded-[2rem] p-8">
        <div className="absolute inset-x-10 top-6 ornament-line" />
        <div className="text-center">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-white/5">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M12 2l8 4v6c0 5-3.2 9.7-8 10-4.8-.3-8-5-8-10V6l8-4z"
                stroke="rgba(255,255,255,0.9)"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h2 className="font-display text-3xl font-semibold tracking-tight text-ivory sm:text-4xl">{title}</h2>
          <p className="mt-2 text-sm text-ivory/70">{subtitle}</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block text-xs uppercase tracking-[0.16em] text-ivory/60">Username</label>
          <input
            className="surface-inner w-full px-4 py-3 text-base text-ivory placeholder:text-ivory/40 focus:border-saffron/50 focus:outline-none focus:ring-2 focus:ring-saffron/20"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="yourname"
            autoComplete="username"
          />

          <label className="block pt-2 text-xs uppercase tracking-[0.16em] text-ivory/60">Password</label>
          <div className="relative">
            <input
              className="surface-inner w-full px-4 py-3 pr-12 text-base text-ivory placeholder:text-ivory/40 focus:border-saffron/50 focus:outline-none focus:ring-2 focus:ring-saffron/20"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              type={showPw ? "text" : "password"}
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-xl border border-white/10 bg-white/5 p-2 text-ivory/70 transition hover:bg-white/10"
              aria-label={showPw ? "Hide password" : "Show password"}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path
                  d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"
                  stroke="rgba(255,255,255,0.75)"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
                <path
                  d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"
                  stroke="rgba(255,255,255,0.75)"
                  strokeWidth="1.6"
                />
              </svg>
            </button>
          </div>

          <button
            type="submit"
            className="mt-2 w-full rounded-2xl border border-white/10 bg-gradient-to-r from-[#f0d7a0] via-[#dda469] to-[#c7794a] px-4 py-3 text-base font-semibold text-[#1c120a] shadow-lg shadow-[#c7794a]/30 transition hover:from-[#f6e1b6] hover:to-[#d48755] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={disabled}
          >
            {busy ? "Checking…" : buttonText}
          </button>

          {showBackLink && (
            <div className="pt-2 text-center">
              <button
                type="button"
                className="text-xs uppercase tracking-[0.18em] text-ivory/60 transition hover:text-saffron"
                onClick={onBack}
              >
                {backText}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
