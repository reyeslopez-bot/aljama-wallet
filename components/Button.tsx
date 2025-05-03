'use client';

import React from 'react';
import clsx from 'clsx';

type ButtonColor = 'blue' | 'yellow' | 'orange' | 'sunsetOrange' | 'terracotta' | 'sand';
type ButtonSize = 'sm' | 'md' | 'lg';

type ButtonProps = {
    label: string;
    action: () => void;
    color?: ButtonColor;
    size?: ButtonSize;
    className?: string;
};

const colorClasses: Record<ButtonColor, string> = {
    blue: 'bg-blue-500 hover:bg-blue-600',
    yellow: 'bg-yellow-500 hover:bg-yellow-600',
    orange: 'bg-orange-500 hover:bg-orange-700',
    sunsetOrange: 'bg-[#FF4C82] hover:bg-orange-600',
    terracotta: 'bg-[#D76C58] hover:bg-[#c15445]',
    sand: 'bg-[#EED9A3] hover:bg-yellow-300',
};

const sizeClasses: Record<ButtonSize, string> = {
    sm: 'text-sm px-4 py-2',
    md: 'text-base px-6 py-3',
    lg: 'text-lg px-8 py-4',
};

export default function Button({
    label,
    action,
    color = 'blue',
    size = 'md',
    className,
}: ButtonProps) {
    return (
        <button
            onClick={action}
            className={clsx(
                'rounded-lg font-semibold shadow-md transition-transform duration-200 ease-in-out hover:scale-105',
                colorClasses[color],
                sizeClasses[size],
                className
            )}
        >
            {label}
        </button>
    );
}

