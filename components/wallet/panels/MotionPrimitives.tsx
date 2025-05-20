// components/wallet/panels/MotionPrimitives.tsx

'use client';

import { motion, MotionProps } from 'framer-motion';
import { HTMLAttributes, forwardRef } from 'react';

type MotionDivProps = HTMLAttributes<HTMLDivElement> & MotionProps;

export const MotionDiv = forwardRef<HTMLDivElement, MotionDivProps>(
    ({ children, ...props }, ref) => (
        <motion.div ref={ref} {...props}>
            {children}
        </motion.div>
    )
);

MotionDiv.displayName = 'MotionDiv';

