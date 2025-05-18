// components/wallet/panels/MotionPrimitives.tsx
import { motion, MotionProps } from 'framer-motion'
import { HTMLAttributes } from 'react'

type MotionDivProps = HTMLAttributes<HTMLDivElement> & MotionProps

export const MotionDiv = motion.div as React.FC<MotionDivProps>

