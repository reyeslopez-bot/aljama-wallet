'use client'

import React, { ReactNode, HTMLAttributes } from 'react'
import clsx from 'clsx'

export interface HeroCardProps extends HTMLAttributes<HTMLDivElement> {
    title: ReactNode
    subtitle?: ReactNode
    children: ReactNode
}

export default function HeroCard({
    title,
    subtitle,
    children,
    className = '',
    ...rest
}: HeroCardProps) {
    return (
        <div
            className={clsx(
                'bg-[rgba(var(--background),0.0)] backdrop-blur-md text-foreground p-7 rounded-xl shadow-soft hover:shadow-heavy transition-all hover:scale-[1.02]',
                className
            )}
            {...rest}
        >
            <div className="mb-2 font-oleo rounded-xl text-3xl text-alloy drop-shadow-lg">
                {title}
            </div>
            {subtitle && (
                <div className="text-lg font-oleo text-gray-700 dark:text-gray-300">
                    {subtitle}
                </div>
            )}
            {children}
        </div>
    )
}

