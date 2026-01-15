// components/SecureGate.tsx
'use client'

import React, { useEffect, useMemo, useState } from 'react'

type SecureGateProps = {
  children: React.ReactNode
  storageKey?: string
}

const DEFAULT_STORAGE_KEY = 'secure_gate_default_v1'

export default function SecureGate({
  children,
  storageKey = DEFAULT_STORAGE_KEY,
}: SecureGateProps) {
  const [mounted, setMounted] = useState(false)
  const [unlocked, setUnlocked] = useState(false)

  // Mark client mount
  useEffect(() => {
    setMounted(true)
  }, [])

  // Load persisted unlock state
  useEffect(() => {
    if (!mounted) return
    try {
      const value = window.localStorage.getItem(storageKey)
      if (value === '1') setUnlocked(true)
    } catch {
      // storage unavailable → fail closed
    }
  }, [mounted, storageKey])

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
        gap: 12,
        boxShadow: '0 20px 60px rgba(0,0,0,0.55)',
        border: '1px solid rgba(255,255,255,0.12)',
        fontFamily: font,
      },
      h1: {
        margin: 0,
        fontSize: 32,
        lineHeight: '38px',
        letterSpacing: '-0.03em',
      },
      p: {
        margin: 0,
        opacity: 0.85,
        fontSize: 16,
        lineHeight: '22px',
        letterSpacing: '-0.01em',
      },
      button: {
        marginTop: 12,
        width: '100%',
        maxWidth: 360,
        height: 48,
        borderRadius: 15,
        border: 'none',
        cursor: 'pointer',
        fontFamily: font,
        letterSpacing: '-0.01em',
        backgroundColor: 'rgb(255,255,255)',
        color: 'rgb(0,0,0)',
        fontWeight: 600 as const,
        fontSize: 16,
      },
    }
  }, [])

  if (!mounted) return null
  if (unlocked) return <>{children}</>

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        <h1 style={styles.h1}>Secure Gate</h1>
        <p style={styles.p}>Continue to access the app.</p>

        <button
          type="button"
          style={styles.button}
          onClick={() => {
            setUnlocked(true)
            try {
              window.localStorage.setItem(storageKey, '1')
            } catch {
              // ignore
            }
          }}
        >
          Continue
        </button>
      </div>
    </div>
  )
}
