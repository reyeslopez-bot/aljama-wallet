// app/layout.tsx
import './globals.css';
import { Oleo_Script } from 'next/font/google';
import Footer from '@/components/Footer';
import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Aljama Wallet',
    description: 'Forge your vault. Unlock your key.',
};

const oleo = Oleo_Script({
    subsets: ['latin'],
    weight: ['400', '700'],
    variable: '--font-oleo',
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body className={`${oleo.variable} antialiased`}>
                {children}
                <Footer />
            </body>
        </html>
    );
}

