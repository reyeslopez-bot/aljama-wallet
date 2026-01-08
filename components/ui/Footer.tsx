// components/ui/Footer.tsx
'use client'

import { BRAND } from '@/constants/brand'
export default function Footer() {
    return (
        <footer className="w-full border-t border-white/10 bg-black/30 py-8 text-white/70">
            <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 md:flex-row">
                <p className="text-sm tracking-wide">
                    &copy; {new Date().getFullYear()} {BRAND.name}. All rights reserved.
                </p>
                <div className="flex flex-wrap items-center gap-4 text-xs uppercase tracking-[0.18em]">
                    <a href="#" className="transition hover:text-amber-200">Privacy</a>
                    <a href="#" className="transition hover:text-amber-200">Terms</a>
                    <a href="#" className="transition hover:text-amber-200">Contact</a>
                </div>
            </div>
        </footer>
    )
}
