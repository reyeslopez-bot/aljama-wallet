'use client';
import React from 'react';
import clsx from 'clsx';

type ButtonProps = {
    label: string;
    onClick: () => void;
    color?: 'blue' | 'yellow' | 'orange' | 'sandblue';
};

export default function Button({ label, onClick, color = 'blue' }: ButtonProps) {
    const gradientMap = {
        blue: 'from-azure to-blue-700',
        orange: 'from-orange-yellow-start to-orange-yellow-end',
        yellow: 'from-yellow-400 to-yellow-500',
        sandblue: 'from-sand-blue-start to-sand-blue-end',
    };

    return (
        <button
            onClick={onClick}
            className={clsx(
                'w-full py-3 text-white font-semibold rounded-lg shadow-md bg-gradient-to-r hover:scale-105 transition-transform',
                gradientMap[color]
            )}
        >
            {label}
        </button>
    );
}

