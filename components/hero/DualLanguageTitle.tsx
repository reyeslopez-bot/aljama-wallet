// components/hero/DualLanguageTitle.tsx
import React from "react";

interface DualLanguageTitleProps {
    arText: string;
    heText: string;
}

const DualLanguageTitle: React.FC<DualLanguageTitleProps> = ({ arText, heText }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 400 60"
        className="w-96 h-12 text-[#faf3e0] opacity-80 animate-fade-in-slow"
    >
        <text x="0" y="50" fill="currentColor" fontSize="40" fontFamily="'Scheherazade', serif">
            {arText}
        </text>
        <text x="220" y="50" fill="currentColor" fontSize="40" fontFamily="'David Libre', serif">
            {heText}
        </text>
    </svg>
);

export default DualLanguageTitle;

