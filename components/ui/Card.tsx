// components/ui/Card.tsx
'use client'

import React from 'react'
import clsx from 'clsx'
import type { ButtonProps } from './Button.tsx'
import Button from './Button'
export type CardProps = {
    title: React.ReactNode
    description: React.ReactNode

    /** If provided, Card will render its own button */
    ctaLabel?: ButtonProps['label']
    ctaAction?: ButtonProps['action']
    /** Reuse Button’s exact variant & size types */
    ctaVariant?: ButtonProps['variant']
    ctaSize?: ButtonProps['size']

    /** Only use this if you want to override the built-in button */
    children?: React.ReactNode

    className?: string
}

export default function Card({
    title,
    description,
    ctaLabel,
    ctaAction,
    ctaVariant = 'primary',
    ctaSize = 'md',
    children,
    className,
}: CardProps) {
    return (
        <section
            className={clsx(
                'surface-panel panel-glow-saffron relative flex h-full flex-col justify-between p-7 text-ivory',
                'transition-transform duration-300 ease-in-out hover:-translate-y-1 hover:shadow-2xl',
                className
            )}
        >
            <div className="absolute inset-x-10 top-6 ornament-line" />
            <header className="text-center">
                <p className="text-xs uppercase tracking-[0.2em] text-saffron/70">Aljama</p>
                <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-ivory">{title}</h2>
                <p className="mt-2 text-sm text-ivory/70">{description}</p>
            </header>

            <div className="mt-6 flex justify-center">
                {children ? (
                    children
                ) : ctaLabel && ctaAction ? (
                    <Button
                        label={ctaLabel}
                        action={ctaAction}
                        variant={ctaVariant}
                        size={ctaSize}
                        className="min-w-[50%]"
                    />
                ) : null}
            </div>
        </section>
    )
}
