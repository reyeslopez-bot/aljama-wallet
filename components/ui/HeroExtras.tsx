// components/HeroExtras.tsx
import React from "react";
import { GlobeAltIcon } from "@heroicons/react/24/outline";

// 1. Floating Mystical Sigils Component
export const FloatingSigils: React.FC = () => {
    return (
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
            <div className="absolute top-1/4 left-1/3 w-16 h-16 bg-sand/10 rounded-full blur-xl animate-float-slow" />
            <div className="absolute top-1/2 right-1/4 w-24 h-24 bg-white/5 rounded-full blur-2xl animate-float-slower" />
            <div className="absolute bottom-1/3 left-1/5 w-20 h-20 bg-[#faf3e0]/10 rounded-full blur-3xl animate-float" />
        </div>
    );
};

// 2. Animated Arabic & Hebrew Title + (placeholder) Language Switcher
export const ArabicTitleCalligraphy: React.FC = () => {
    return (
        <div className="absolute top-4 right-4 z-20 flex items-center space-x-4">
            <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 400 60"
                className="w-96 h-12 text-[#faf3e0] opacity-80 animate-fade-in-slow"
            >
                <text x="0" y="50" fill="currentColor" fontSize="50" fontFamily="'Scheherazade', serif">
                    ﺎﻠﻤﻔﺗﺎﺣ
                </text>
                <text x="220" y="50" fill="currentColor" fontSize="50" fontFamily="'David Libre', serif">
                    המפתח
                </text>
            </svg>

            <div className="relative text-[#faf3e0]">
                <button className="flex items-center space-x-1 hover:opacity-80 transition">
                    <GlobeAltIcon className="h-5 w-5" />
                    <span className="text-sm">Language</span>
                </button>
            </div>
        </div>
    );
};

// 3. Fog Particle Overlay
export const FogParticlesOverlay: React.FC = () => {
    return <div className="absolute inset-0 z-10 pointer-events-none" />;
};
















    
    
    

    
