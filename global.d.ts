import 'framer-motion';

declare module 'framer-motion' {
  interface MotionProps {
    className?: string;
    style?: React.CSSProperties;
    children?: React.ReactNode;
    ref?: React.Ref<any>;
  }
}

