'use client'; // This ensures the component is interactive in Next.js (App Router)

import React from 'react';

type ButtonProps = {
    label: string;
    onClick: () => VideoDecoder;
    color?: 'blue' | 'yellow' | 'orange';
};

export default function Button({ label, onClick, color = 'blue'}: ButtonProps) {
    const bgColor =
    color === 'blue'
      ? 'bg-gradient-to-r from-blue-400 to-0080FF'
      : color === 'orange'
      ? 'bg-gradient-to-r from-C46210 to-yellow-500'
      : 'bg-gradient-to-r from-efddc2 to-yellow-300';
    
    return (
        <button
            onClick={onClick}
            className={'w-full py-3 text-white font-medium rounded-lg transition-transform transform hover:scale-105 ${bgColor}'}
        >
            {label}
        </button>
    );
}