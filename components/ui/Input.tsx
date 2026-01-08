// components/ui/Input.tsx
'use client'

import clsx from 'clsx'
import type { InputHTMLAttributes } from 'react'

type InputProps = {
  label?: string
  hint?: string
  error?: string | null
} & InputHTMLAttributes<HTMLInputElement>

export default function Input({
  label,
  hint,
  error,
  className,
  ...props
}: InputProps) {
  return (
    <label className="flex w-full flex-col gap-2">
      {label && (
        <span className="text-xs uppercase tracking-[0.16em] text-white/60">{label}</span>
      )}

      <input
        className={clsx(
          'w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-base text-white shadow-inner shadow-black/50',
          'placeholder:text-white/40 focus:border-amber-200/50 focus:outline-none focus:ring-2 focus:ring-amber-200/20',
          error && 'border-red-400/40 focus:border-red-300/60',
          className,
        )}
        {...props}
      />

      {hint && !error && <span className="text-xs text-white/40">{hint}</span>}
      {error && <span className="text-xs text-red-300">{error}</span>}
    </label>
  )}
