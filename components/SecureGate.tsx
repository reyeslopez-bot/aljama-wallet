// components/SecureGate.tsx
'use client'

import React, { useMemo, useState } from 'react'

type SecureGateProps = {
  children: React.ReactNode
  storageKey?: string
}

export default function SecureGate({
  children,
  storageKey = 'secure_gate_continue_v1',
}: SecureGateProps) {
  const [unlocked, setUnlocked] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(storageKey) === '1'
  })

  const styles = useMemo(() => {
    const font = 'Inter, "Inter Placeholder", sans-serif'
    return {
      overlay: {
        position: 'fixed' as const,
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        backgroundColor: 'rgba(0,0,0,0.85)',
      },
      card: {
        width: '100%',
        maxWidth: 520,
        backgroundColor: 'rgb(0,0,0)',
        color: 'rgb(255,255,255)',
        padding: 24,
        borderRadius: 26,
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'center',
        textAlign: 'center' as const,
      },
      logo: {
        width: 45,
        height: 45,
        marginBottom: 32,
        objectFit: 'contain' as const,
      },
      h1: {
        fontSize: 32,
        fontWeight: 700,
        lineHeight: '1em',
        margin: '0 0 20px 0',
        fontFamily: font,
        letterSpacing: '-0.03em',
      },
      p: {
        fontSize: 15,
        fontWeight: 500,
        lineHeight: '1.3em',
        marginBottom: 28,
        fontFamily: font,
        letterSpacing: '-0.01em',
      },
      button: {
        width: '100%',
        maxWidth: 360,
        padding: '14px 16px',
        fontSize: 15,
        fontWeight: 600,
        color: 'rgb(255,255,255)',
        backgroundColor: 'rgb(48,48,48)',
        borderRadius: 15,
        border: 'none',
        cursor: 'pointer',
        fontFamily: font,
        letterSpacing: '-0.01em',
      },
    }
  }, [])

  if (unlocked) return <>{children}</>

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        <img
          src="https://framerusercontent.com/images/SaK5AKcOqROLqWFGbZjsGcMKYs.webp"
          alt=""
          style={styles.logo}
        />

        <h1 style={styles.h1}>Secure Gate</h1>
        <p style={styles.p}>
          This space contains interactive wallet functionality.
        </p>

        <button
          type="button"
          style={styles.button}
          onClick={() => {
            setUnlocked(true)
            try {
              window.localStorage.setItem(storageKey, '1')
            } catch {
              // ignore storage errors
            }
          }}
        >
          Continue
        </button>
      </div>
    </div>
  )
}
