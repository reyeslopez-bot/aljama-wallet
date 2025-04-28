'use client';

import React from 'react';
import clsx from 'clsx';

type CardProps = {
    title: React.ReactNode;
    description: React.ReactNode;
    children?: React.ReactNode;
    className?: string;
};

export default function Card({ title, description, children, className }: CardProps) {
    return (
        <div
            className={clsx(
                'bg-sand backdrop-blur-sm text-gray-800 p-7 rounded-2xl shadow-lg transition-transform transition-shadow duration-300 ease-in-out hover:scale-105 hover:shadow-2xl',
                className
            )}
        >
            <h2 className="text-2xl font-bold text-terracotta mb-3">{title}</h2>
            <p className="text-md font-oleo text-gray-700 dark:text-gray-300 mb-4">{description}</p>
            {children}
        </div>
    );
}
