'use client';

import React from 'react';
import clsx from 'clsx';

type ButtonColor = 'blue' | 'yellow' | 'orange' | 'sunsetOrange' | 'terracotta' | 'sand';

type ButtonProps = {
    label: string;
    action: () => void;
    color?: ButtonColor;
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

export default function Button({
    label,
    action,
    color = 'blue',
    className,
}: ButtonProps) {
    return (
        <button
            onClick={action}
            className={clsx(
                'w-full py-3 text-gray font-semibold rounded-lg shadow-md bg-gradient-to-r hover:scale-105 transition-transform',
                colorClasses[color],
                className
            )}
        >
            {label}
        </button>
    );
}

