'use client';

import { motion } from 'framer-motion';
import { forwardRef } from 'react';

// Properly typed wrapper for motion.div with ref
const MotionDiv = forwardRef<HTMLDivElement, React.ComponentProps<typeof motion.div>>(
    (props, ref) => <motion.div ref={ref} {...props} />
);

MotionDiv.displayName = 'MotionDiv';

export default MotionDiv;

