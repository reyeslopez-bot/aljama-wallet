import React, { useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import MotionDiv from '@/components/fowardRef';

interface WalletDrawerProps {
    open: boolean;
    onCloseAction: () => void;
    mode: 'create' | 'unlock' | 'import';
    showOverlay?: boolean;
    children?: React.ReactNode;
}

const WalletDrawer: React.FC<WalletDrawerProps> = ({
    open,
    onCloseAction,
    mode,
    showOverlay = true,
    children,
}) => {
    const drawerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open || !drawerRef.current) return;

        const firstFocusable = drawerRef.current.querySelector<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );

        if (firstFocusable) {
            firstFocusable.focus();
        }
    }, [open]);

    const modeTitle: Record<WalletDrawerProps['mode'], string> = {
        create: 'Create Wallet',
        unlock: 'Unlock Wallet',
        import: 'Import Wallet',
    };

    return (
        <AnimatePresence>
            {open && (
                <>
                    {showOverlay && (
                        <MotionDiv
                            className="fixed inset-0 bg-black bg-opacity-30 z-40"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.3 }}
                            onClick={onCloseAction}
                        />
                    )}

                    <MotionDiv
                        ref={drawerRef}
                        className="fixed right-0 top-0 h-full w-80 bg-white z-50 shadow-lg"
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'tween', duration: 0.3 }}
                    >
                        <h2 className="text-xl font-bold p-4">{modeTitle[mode]}</h2>
                        <div className="p-4">{children}</div>
                    </MotionDiv>
                </>
            )}
        </AnimatePresence>
    );
};

export default WalletDrawer;

