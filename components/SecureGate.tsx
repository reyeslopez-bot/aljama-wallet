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
        fontFamily: font,
      },
      h1: {
        fontSize: 28,
        marginBottom: 12,
        letterSpacing: '-0.02em',
      },
      p: {
        fontSize: 16,
        opacity: 0.85,
        marginBottom: 24,
      },
      button: {
        padding: '12px 20px',
        borderRadius: 15,
        border: 'none',
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
