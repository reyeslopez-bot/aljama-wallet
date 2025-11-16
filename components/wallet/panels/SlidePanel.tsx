'use client';

import React from 'react';
import { motion } from 'framer-motion';

type Direction = 'left' | 'right';

// Use framer-motion's own prop type for motion.div
type MotionDivProps = React.ComponentPropsWithoutRef<typeof motion.div>;

// Allow normal div props + motion props. Remove variant control props from the surface.
export type SlidePanelProps = Omit<
  MotionDivProps,
  'initial' | 'animate' | 'exit' | 'variants'
> & {
  direction?: Direction;
  role?: React.AriaRole;
};

export const SlidePanel: React.FC<SlidePanelProps> = ({
  direction = 'right',
  className = '',
  role,
  children,
  ...rest
}) => {
  const variants = {
    hidden: {
      x: direction === 'left' ? '-100%' : '100%',
      opacity: 0,
      transition: { type: 'tween', stiffness: 300 },
    },
    visible: {
      x: 0,
      opacity: 1,
      transition: { type: 'tween', stiffness: 300 },
    },
    exit: {
      x: direction === 'left' ? '-100%' : '100%',
      opacity: 0,
      transition: { type: 'tween', stiffness: 300 },
    },
  };

  return (
    <>
      {(() => {
        const motionProps = {
          role: role ?? 'dialog',
          'aria-modal': 'true',
          initial: 'hidden',
          animate: 'visible',
          exit: 'exit',
          variants,
          className: `absolute top-0 bottom-0 w-1/2 p-6 z-40 bg-[#1a1816] shadow-xl ${
            direction === 'left' ? 'left-0' : 'right-0'
          } ${className}`,
          ...rest, // <- includes onClick, etc.
        } as any;

        return (
          <motion.div {...motionProps}>
            {children}
          </motion.div>
        );
      })()}
    </>
  );
};

SlidePanel.displayName = 'SlidePanel';
