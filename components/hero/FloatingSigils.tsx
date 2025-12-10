'use client'

import React from 'react'

const sigils = [
  {
    className:
      'left-[8%] top-[18%] h-24 w-24 bg-[radial-gradient(circle_at_30%_30%,rgba(233,180,133,0.18),transparent_60%)] blur-3xl',
    animation: 'animate-float-slower',
  },
  {
    className:
      'right-[14%] top-[32%] h-32 w-32 bg-[radial-gradient(circle_at_70%_40%,rgba(52,211,153,0.18),transparent_55%)] blur-2xl',
    animation: 'animate-float-slow',
  },
  {
    className:
      'left-[35%] bottom-[22%] h-28 w-28 bg-[radial-gradient(circle_at_40%_60%,rgba(255,255,255,0.12),transparent_60%)] blur-3xl',
    animation: 'animate-float',
  },
]

export const FloatingSigils: React.FC = () => (
  <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(255,255,255,0.05),transparent_65%)] opacity-50 mix-blend-screen" />

    {sigils.map((sigil, index) => (
      <div key={index} className={`absolute ${sigil.className} ${sigil.animation}`} />
    ))}

    <div className="absolute inset-x-8 bottom-8 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
  </div>
)
