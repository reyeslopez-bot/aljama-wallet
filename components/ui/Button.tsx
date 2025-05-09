// components/Button.tsx
'use client'

import React from 'react'
import clsx from 'clsx'

export type ButtonVariant = 'primary' | 'accent' | 'danger' | 'default'
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
    accent: 'bg-orange-500 hover:bg-orange-600 text-white',
    danger: 'bg-red-600 hover:bg-red-700 text-white',
    default: 'bg-alloy-600 hover:bg-alloy-700 text-white'
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
    sm: 'px-3 py-2 text-sm',
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
                // base reset + focus ring
                'rounded-xl font-medium shadow focus:outline-none focus:ring-2 focus:ring-offset-2',
                // variant-specific colors
                VARIANT_CLASSES[variant],
                // size-specific padding + font-size
                SIZE_CLASSES[size],
                // any additional classes passed in
                className
            )}
        >
            {label}
        </button>
    )
}

