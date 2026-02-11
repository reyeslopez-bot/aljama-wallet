// components/SecureGate.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'

type SecureGateProps = {
  children: React.ReactNode
  storageKey?: string
}

export default function SecureGate({ children, storageKey }: SecureGateProps) {
  const [mounted, setMounted] = useState(false)
  const [unlocked, setUnlocked] = useState(false)

  useEffect(() => {
    setMounted(true)
    if (!storageKey) return
    const stored = window.localStorage.getItem(storageKey)
    if (stored === '1') setUnlocked(true)
  }, [storageKey])

  const styles = useMemo(() => {
    const font = 'var(--font-body), system-ui, sans-serif'
    const display = 'var(--font-display), serif'
    return {
      overlay: {
        position: 'fixed' as const,
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        backgroundColor: 'rgba(9,12,14,0.85)',
      },
      card: {
        width: '100%',
        maxWidth: 520,
        background: 'linear-gradient(180deg, rgba(15,18,22,0.96), rgba(8,10,12,0.98))',
        color: 'rgb(237,229,215)',
        padding: 28,
        borderRadius: 28,
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.45)',
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'center',
        textAlign: 'center' as const,
        fontFamily: font,
      },
      h1: {
        fontSize: 28,
        marginBottom: 12,
        letterSpacing: '-0.02em',
        fontFamily: display,
      },
      p: {
        fontSize: 16,
        opacity: 0.75,
        marginBottom: 24,
      },
      button: {
        padding: '12px 22px',
        borderRadius: 18,
        border: '1px solid rgba(255,255,255,0.12)',
        background: 'linear-gradient(135deg, #f0d7a0, #dda469, #c7794a)',
        color: '#1c120a',
        cursor: 'pointer',
        fontFamily: font,
        letterSpacing: '-0.01em',
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
            if (storageKey) {
              window.localStorage.setItem(storageKey, '1')
            }
          }}
        >
          Continue
        </button>
      </div>
    </div>
  )
}
