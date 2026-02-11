// global.d.ts
import type * as React from 'react'
import type { DefaultSession } from 'next-auth'

declare module 'framer-motion' {
  interface MotionProps {
    className?: string
    style?: React.CSSProperties
    children?: React.ReactNode
    ref?: React.Ref<unknown>
  }
}

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
    } & DefaultSession['user']
  }
}

export {}
