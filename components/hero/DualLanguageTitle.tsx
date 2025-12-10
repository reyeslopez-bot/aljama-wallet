import React from 'react'

type DualLanguageTitleProps = {
  arText: string
  heText: string
  className?: string
}

const DualLanguageTitle: React.FC<DualLanguageTitleProps> = ({ arText, heText, className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 400 60"
    className={`h-12 w-96 text-[#faf3e0] opacity-85 drop-shadow-[0_4px_30px_rgba(0,0,0,0.25)] animate-fade-in-slow ${className ?? ''}`.trim()}
  >
    <text x="0" y="50" fill="currentColor" fontSize="40" fontFamily="'Scheherazade', serif">
      {arText}
    </text>
    <text x="220" y="50" fill="currentColor" fontSize="40" fontFamily="'David Libre', serif">
      {heText}
    </text>
  </svg>
)

export default DualLanguageTitle
