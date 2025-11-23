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
  'rounded focus:outline-none focus:ring-2 focus:ring-offset-2 transition transform duration-200 hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed'

// Variants
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-blue-600 hover:bg-blue-700 text-white font-semibold focus:ring-blue-500',
  accent: 'bg-orange-500 hover:bg-orange-600 text-white font-semibold focus:ring-orange-400',
  danger: 'bg-red-600 hover:bg-red-700 text-white font-semibold focus:ring-red-500',
  default: 'bg-slate-600 hover:bg-slate-700 text-white font-semibold focus:ring-slate-500',
  // new secondary (outline / neutral)
  secondary:
    'bg-transparent border border-slate-400 text-slate-800 hover:bg-slate-100 focus:ring-slate-400',
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
