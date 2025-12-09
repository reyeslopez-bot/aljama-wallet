// global.d.ts

// Extend framer-motion's MotionProps safely
declare module 'framer-motion' {
  interface MotionProps {
    className?: string;
    style?: React.CSSProperties;
    children?: React.ReactNode;
    ref?: React.Ref<unknown>; // no "any"
  }
}
