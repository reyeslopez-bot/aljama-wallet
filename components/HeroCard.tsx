'use client';

import React from 'react';
import clsx from 'clsx';

type HeroCardProps = {
    title: React.ReactNode;
    subtitle?: React.ReactNode;
    className?: string;
};

export default function HeroCard({ title, subtitle, className }: HeroCardProps) {
    return (
        <div
            className={clsx(
                'bg-[rgba(var(--background),0.0)] backdrop-blur-md text-foreground p-7 rounded-xl shadow-soft hover:shadow-heavy transition-all hover:scale-[1.02]',
                className
            )}
        >
            <div className="mb-2 font-oleo rounded-xl text-3xl text-alloy drop-shadow-lg">{title}</div>
            {subtitle && (
                <div className="text-lg font-oleo text-gray-700 dark:text-gray-300">{subtitle}</div>
            )}
        </div>
    );
}

