'use client';

import React from 'react';
import clsx from 'clsx';

export type ButtonVariant = 'primary' | 'accent' | 'danger' | 'default';
export type ButtonSize = 'sm' | 'md' | 'lg';
export type HTMLButtonType = 'button' | 'submit' | 'reset';

export interface ButtonProps {
    label?: string;
    children?: React.ReactNode;
    action?: () => void;
    variant?: ButtonVariant;
    size?: ButtonSize;
    className?: string;
    type?: HTMLButtonType;
    disabled?: boolean;
}

// Base styles
const BASE_BUTTON_CLASSES =
    'rounded focus:outline-none focus:ring-2 focus:ring-offset-2 transition transform duration-200 hover:-translate-y-0.5 hover:shadow-lg';

// Variants
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white font-semibold',
    accent: 'bg-orange-500 hover:bg-orange-600 text-white font-semibold',
    danger: 'bg-red-600 hover:bg-red-700 text-white font-semibold',
    default: 'bg-slate-600 hover:bg-slate-700 text-white font-semibold',
};

// Sizes
const SIZE_CLASSES: Record<ButtonSize, string> = {
    sm: 'px-3 py-2 text-sm',
    md: 'px-6 py-3 text-base',
    lg: 'px-8 py-4 text-lg',
};

export default function Button({
    label,
    children,
    action,
    variant = 'default',
    size = 'md',
    className,
    type = 'button',
    disabled = false,
}: ButtonProps) {
    return (
        <button
            type={type}
            onClick={action}
            disabled={disabled}
            className={clsx(
                BASE_BUTTON_CLASSES,
                VARIANT_CLASSES[variant],
                SIZE_CLASSES[size],
                className
            )}
        >
            {children ?? label}
        </button>
    );
}

