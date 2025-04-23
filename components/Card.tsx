'use client';
import React, { ReactNode } from 'react';
import clsx from 'clsx';

type CardProps = {
    title: string;
    description: string;
    children?: ReactNode;
    className?: string;
};

export default function Card({ title, description, children, className }: CardProps) {
    return (
        <div
            className={clsx(
                'bg-background text-foreground p-6 rounded-xl shadow-soft hover:shadow-heavy transition-all hover:scale-[1.02]',
                className
            )}
        >
            <h2 className="text-xl font-bold text-alloy mb-3">{title}</h2>
            <p className="text-gray-600 dark:text-gray-300 mb-4">{description}</p>
            {children}
        </div>
    );
}

