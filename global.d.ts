// global.d.ts
import type * as React from 'react'

declare module 'framer-motion' {
  interface MotionProps {
    className?: string
    style?: React.CSSProperties
    children?: React.ReactNode
    ref?: React.Ref<unknown>
  }
}

export {}
