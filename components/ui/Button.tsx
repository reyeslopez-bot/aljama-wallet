// components/ui/Button.tsx
'use client'

import React from 'react'
import clsx from 'clsx'

export type ButtonVariant = 'primary' | 'accent' | 'danger' | 'default' | 'secondary'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label?: string
  children?: React.ReactNode
  action?: () => void // kept for compatibility
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
}

// Base styles
const BASE_BUTTON_CLASSES =
  'rounded-2xl border border-white/10 focus:outline-none focus:ring-2 focus:ring-saffron/40 focus:ring-offset-0 transition duration-200 hover:-translate-y-0.5 hover:shadow-xl disabled:opacity-60 disabled:cursor-not-allowed'

// Variants
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-r from-[#f0d7a0] via-[#dda469] to-[#c7794a] text-[#1c120a] font-semibold shadow-lg shadow-[#c7794a]/30 hover:from-[#f6e1b6] hover:to-[#d48755]',
  accent:
    'bg-gradient-to-r from-[#6fa0d9] via-[#5e8bb8] to-[#4b9577] text-white font-semibold shadow-lg shadow-[#4b9577]/30 hover:from-[#7bb0e6] hover:to-[#5aa687]',
  danger:
    'bg-gradient-to-r from-red-500 to-rose-600 text-white font-semibold shadow-lg shadow-red-500/25 hover:from-red-400 hover:to-rose-600',
  default:
    'bg-white/5 text-ivory/90 font-semibold shadow-inner shadow-black/40 hover:bg-white/10',
  secondary:
    'bg-transparent border border-white/20 text-ivory/80 hover:border-saffron/40 hover:bg-white/10',
}

// Sizes
const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-3 py-2 text-sm',
  md: 'px-6 py-3 text-base',
  lg: 'px-8 py-4 text-lg',
}

export default function Button({
  label,
  children,
  action,
  variant = 'default',
  size = 'md',
  className,
  onClick,
  type = 'button',
  disabled = false,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick ?? action}
      disabled={disabled}
      data-variant={variant}
      className={clsx(
        BASE_BUTTON_CLASSES,
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...rest}
    >
      {children ?? label}
    </button>
  )
}
