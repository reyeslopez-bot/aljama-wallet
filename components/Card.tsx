'use client'; // This ensures the component is interactive in Next.js (App Router)

import React, { ReactNode } from 'react';

type CardProps = {
    title: string;
    description: string;
    children?: ReactNode;
    className?: string; // Allows for custom styling
};

export default function Card({ title, description, children, className = '' }: CardProps) {
    return (
        <div 
            className={'p-8 rounded-lg shadow-soft transition-all hover:scale-105 ${className}'}
        >    
            <h2 className="text-2xl font-bold text-alloy mb-4">{title}</h2>
            <p className="text-gray-600:text-gray-300 mb-6">{description}</p>
            {children}
        </div>
    );
}