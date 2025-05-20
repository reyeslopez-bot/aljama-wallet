//FloatingMysticalSigils.tsx
import React from "react";

// Floating Mystical Sigils Component
export const FloatingSigils: React.FC = () => {
    return (
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
            <div className="absolute top-1/4 left-1/3 w-16 h-16 bg-sand/10 rounded-full blur-xl animate-float-slow" />
            <div className="absolute top-1/2 right-1/4 w-24 h-24 bg-white/5 rounded-full blur-2xl animate-float-slower" />
            <div className="absolute bottom-1/3 left-1/5 w-20 h-20 bg-[#faf3e0]/10 rounded-full blur-3xl animate-float" />
        </div>
    );
};
