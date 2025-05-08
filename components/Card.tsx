// components/Card.tsx
'use client'

import React from 'react'
import clsx from 'clsx'
// ✅ Use the alias to import Button and its types
import Button, { ButtonProps } from '@/components/Button'

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
                'flex flex-col justify-between h-full',
                'bg-sand backdrop-blur-sm text-gray-800 p-6 rounded-2xl shadow-lg',
                'transition-transform transition-shadow duration-300 ease-in-out hover:scale-105 hover:shadow-2xl',
                className
            )}
        >
            <header className="text-center mb-4">
                <h2 className="text-3xl font-bold text-terracotta mb-2">{title}</h2>
                <p className="text-lg font-oleo text-gray-700 dark:text-gray-300">
                    {description}
                </p>
            </header>

            <div className="flex justify-center">
                {children ? (
                    children
                ) : ctaLabel && ctaAction ? (
                    <Button
                        label={ctaLabel}
                        action={ctaAction}
                        variant={ctaVariant}
                        size={ctaSize}
                        className="w-1/2 min-w-[50%]"
                    />
                ) : null}
            </div>
        </section>
    )
}

