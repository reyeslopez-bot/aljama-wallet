'use client'

import React from 'react'

import DualLanguageTitle from './DualLanguageTitle'
import LanguageSwitcher from '../ui/LanguageSwitcher'

export const TitleCalligraphy: React.FC = () => (
  <div className="absolute right-4 top-4 z-30 flex flex-col items-end gap-3 sm:right-6 sm:top-6">
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/50 px-4 py-3 shadow-lg shadow-black/40 backdrop-blur">
      <DualLanguageTitle arText="ﺎﻠﻤﻔﺗﺎﺣ" heText="המפתח" className="h-10 w-[22rem]" />
      <div className="h-10 w-px bg-gradient-to-b from-transparent via-white/40 to-transparent" />
      <div className="text-[#faf3e0]">
        <LanguageSwitcher />
      </div>
    </div>

    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/80 backdrop-blur">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]" />
      Sand-script interface
    </div>
  </div>
)

