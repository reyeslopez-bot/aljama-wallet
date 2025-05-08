// components/Button.tsx
'use client'

import React from 'react'
import clsx from 'clsx'

// 1️⃣ Export these types so other components can reuse them
export type ButtonVariant = 'primary' | 'accent' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps {
    label: string
    action: () => void
    variant?: ButtonVariant
    size?: ButtonSize
    className?: string
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white',
    accent: 'bg-[#FF4C82] hover:bg-orange-600 text-white',
    danger: 'bg-red-600 hover:bg-red-700 text-white',
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-6 py-3 text-base',
    lg: 'px-8 py-4 text-lg',
}

export default function Button({
    label,
    action,
    variant = 'primary',
    size = 'md',
    className,
}: ButtonProps) {
    return (
        <button
            type="button"
            onClick={action}
            className={clsx(
                'inline-block font-semibold rounded-lg shadow-md transition-transform duration-200 ease-in-out hover:scale-105',
                VARIANT_CLASSES[variant],
                SIZE_CLASSES[size],
                className
            )}
        >
            {label}
        </button>
    )
}

