'use client'

import React from 'react'
import clsx from 'clsx'

// Define types for button variants and sizes
export type ButtonVariant = 'primary' | 'accent' | 'danger' | 'default'
export type ButtonSize = 'sm' | 'md' | 'lg'
export type HTMLButtonType = 'button' | 'submit' | 'reset'

// Define props for the Button component
export interface ButtonProps {
    label: string
    action?: () => void // Now optional
    variant?: ButtonVariant
    size?: ButtonSize
    className?: string
    type?: HTMLButtonType // New prop for HTML button type
}

// Base button class for centralizedf shared styles so the componenet can stay clean and easy to modify.
const BASE_BUTTON_CLASSES = 'rounded focus:outline-none focus:ring-2 focus:ring-offset-2',
'transition transform duration-200 hover:-translate-y-0.5 hover:shadow-lg'
// Variant class mappings
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white',
    accent: 'bg-orange-500 hover:bg-orange-600 text-white',
    danger: 'bg-red-600 hover:bg-red-700 text-white',
    default: 'bg-alloy-600 hover:bg-alloy-700 text-white',
}

// Size class mappings
const SIZE_CLASSES: Record<ButtonSize, string> = {
    sm: 'px-3 py-2 text-sm',
    md: 'px-6 py-3 text-base',
    lg: 'px-8 py-4 text-lg',
}

// Button component
export default function Button({
    label,
    action,
    variant = 'primary',
    size = 'md',
    className,
    type = 'button',
}: ButtonProps) {
    return (
        <button
            type={type}
            onClick={action}
            className={clsx(
                'rounded focus:outline-none focus:ring-2 focus:ring-offset-2',
                'transition transform duration-200 hover:-translate-y-0.5 hover:shadow-lg',
                VARIANT_CLASSES[variant],
                SIZE_CLASSES[size],
                className
            )}
        >
            {label}
        </button>
    )
}

