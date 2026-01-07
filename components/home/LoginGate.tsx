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
    <div style={styles.stage}>
      <div style={styles.glowA} />
      <div style={styles.glowB} />

      <div style={styles.card}>
        <div style={styles.header}>
          <div style={styles.shield} aria-hidden>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 2l8 4v6c0 5-3.2 9.7-8 10-4.8-.3-8-5-8-10V6l8-4z"
                stroke="rgba(255,255,255,0.9)"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <div style={styles.title}>{title}</div>
          <div style={styles.subtitle}>{subtitle}</div>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>Username</label>
          <input
            style={styles.input}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="yourname"
            autoComplete="username"
          />

          <label style={{ ...styles.label, marginTop: 14 }}>Password</label>
          <div style={styles.pwRow}>
            <input
              style={{ ...styles.input, paddingRight: 44 }}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              type={showPw ? "text" : "password"}
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              style={styles.eyeBtn}
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

          <button type="submit" style={{ ...styles.cta, ...(disabled ? styles.ctaDisabled : {}) }} disabled={disabled}>
            {busy ? "Checking…" : buttonText}
          </button>

          {showBackLink && (
            <div style={styles.backRow}>
              <button type="button" style={styles.backLink} onClick={onBack}>
                {backText}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  stage: {
    width: "100%",
    minHeight: 520,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#050507",
    position: "relative",
    overflow: "hidden",
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    padding: 24,
  },
  glowA: {
    position: "absolute",
    inset: "-20%",
    background:
      "radial-gradient(closest-side at 50% 35%, rgba(255,255,255,0.10), rgba(255,255,255,0.00) 62%)",
    pointerEvents: "none",
  },
  glowB: {
    position: "absolute",
    width: 720,
    height: 720,
    borderRadius: 999,
    left: "50%",
    top: "40%",
    transform: "translate(-50%, -50%)",
    background:
      "radial-gradient(circle at 60% 40%, rgba(140,160,255,0.18), rgba(0,0,0,0) 60%)",
    filter: "blur(20px)",
    pointerEvents: "none",
  },
  card: {
    width: 520,
    maxWidth: "92vw",
    borderRadius: 26,
    padding: 28,
    background: "rgba(12, 12, 16, 0.66)",
    border: "1px solid rgba(255,255,255,0.10)",
    boxShadow: "0 30px 90px rgba(0,0,0,0.55)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
    position: "relative",
  },
  header: { textAlign: "center", marginBottom: 18 },
  shield: {
    width: 42,
    height: 42,
    borderRadius: 14,
    margin: "0 auto 12px",
    display: "grid",
    placeItems: "center",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.10)",
  },
  title: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 40,
    lineHeight: 1.05,
    fontWeight: 700,
    letterSpacing: -0.8,
  },
  subtitle: { marginTop: 10, color: "rgba(255,255,255,0.62)", fontSize: 15, lineHeight: 1.4 },
  form: { marginTop: 18 },
  label: { display: "block", color: "rgba(255,255,255,0.62)", fontSize: 13, marginBottom: 8 },
  input: {
    width: "100%",
    height: 54,
    borderRadius: 16,
    padding: "0 16px",
    color: "rgba(255,255,255,0.92)",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.10)",
    outline: "none",
    fontSize: 16,
  },
  pwRow: { position: "relative" },
  eyeBtn: {
    position: "absolute",
    right: 10,
    top: 9,
    width: 36,
    height: 36,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.05)",
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
  },
  cta: {
    marginTop: 18,
    width: "100%",
    height: 60,
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.10)",
    color: "rgba(255,255,255,0.92)",
    fontSize: 16,
    fontWeight: 650,
    cursor: "pointer",
    boxShadow: "0 16px 40px rgba(0,0,0,0.45)",
  },
  ctaDisabled: { opacity: 0.55, cursor: "not-allowed" },
  backRow: { marginTop: 16, textAlign: "center" },
  backLink: {
    background: "transparent",
    border: "none",
    color: "rgba(255,255,255,0.68)",
    textDecoration: "none",
    fontSize: 14,
    cursor: "pointer",
  },
}
