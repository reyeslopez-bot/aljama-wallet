// SlidePanel.tsx
// Add this at the very top of the file
'use client';

import { motion, MotionProps } from 'framer-motion';
import React from 'react';

interface SlidePanelProps extends MotionProps {
    direction: 'left' | 'right';
    children: React.ReactNode;
    className?: string;
}

export const SlidePanel: React.FC<SlidePanelProps> = ({ 
    direction, 
    children, 
    className = '', 
    ...motionProps 
}) => {
    const variants = {
        hidden: {
            x: direction === 'left' ? '-100%' : '100%',
            opacity: 0,
            transition: { type: 'tween', stiffness: 300 } // Added transition here for consistency
        },
        visible: {
            x: 0,
            opacity: 1,
            transition: { type: 'tween', stiffness: 300 }
        },
        exit: {
            x: direction === 'left' ? '-100%' : '100%',
            opacity: 0,
            transition: { type: 'tween', stiffness: 300 } // Added exit transition
        },
    };

    return (
        <motion.div
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={variants}
            className={`
                absolute top-0 bottom-0 
                w-1/2 p-6 z-40 
                bg-[#1a1816] shadow-xl 
                ${direction === 'left' ? 'left-0' : 'right-0'} 
                ${className}
            `}
            {...motionProps}
        >
            {children}
        </motion.div>
    );
};
