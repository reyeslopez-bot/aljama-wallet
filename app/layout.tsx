// app/layout.tsx
import './globals.css'
import { Oleo_Script } from 'next/font/google'
import type { ReactNode } from 'react'
import LayoutClient from '../components/layout/LayoutClient'

const oleo = Oleo_Script({
    subsets: ['latin'],
    weight: ['400', '700'],
    variable: '--font-oleo',
})

export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="en">
            <body className={`${oleo.variable} antialiased min-h-screen flex flex-col`}>
                {/* Everything client-side (Wagmi, Drawer) is delegated to LayoutClient */}
                <LayoutClient>
                    {children}
                </LayoutClient>
            </body>
        </html>
    )
}

