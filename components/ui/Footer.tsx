// components/ui/Footer.tsx
'use client'

import { BRAND } from '@/constants/brand'
export default function Footer() {
    return (
        <footer className="w-full border-t border-saffron/20 bg-black/40 py-8 text-ivory/70">
            <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 md:flex-row">
                <p className="text-sm tracking-wide">
                    &copy; {new Date().getFullYear()} {BRAND.name}. All rights reserved.
                </p>
                <div className="flex flex-wrap items-center gap-4 text-xs uppercase tracking-[0.18em]">
                    <a href="#" className="transition hover:text-saffron">Privacy</a>
                    <a href="#" className="transition hover:text-saffron">Terms</a>
                    <a href="#" className="transition hover:text-saffron">Contact</a>
                </div>
            </div>
        </footer>
    )
}
