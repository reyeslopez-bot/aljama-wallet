'use client'; // This ensures the component is interactive in Next.js (App Router)

import React from 'react';
import Link from 'next/link';

export default function Header() {
    return (
        <header className="w-full bg-blue-600 text-white p-4">
            <div className="max-w-5xl mx-auto flex items-center justify-between">
                <h1 className="text-3xl font-bold">Aljama Wallet</h1>
                <nav className="space-x-4">
                    <Link href="/" className="hover:underline">
                        Home
                    </Link>
                    <Link href="/about">
                        About Us
                    </Link>
                    <Link href="/contact">
                        Contact
                    </Link>
                </nav>
            </div>    
        </header>
    );
}