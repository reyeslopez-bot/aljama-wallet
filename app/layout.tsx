import type { Metadata } from "next";
import "./globals.css";

import { Geist, Geist_Mono, Oleo_Script } from "next/font/google";
import Footer from "@/components/Footer";

// 🎨 Font imports via `next/font/google`
const geistSans = Geist({
    subsets: ["latin"],
    variable: "--font-geist-sans",
});

const geistMono = Geist_Mono({
    subsets: ["latin"],
    variable: "--font-geist-mono",
});

const oleo = Oleo_Script({
    subsets: ["latin"],
    weight: ["400", "700"],
    variable: "--font-oleo",
});

// 🧠 Page metadata
export const metadata: Metadata = {
    title: "Aljama Wallet",
    description: "Forge your vault. Unlock your key. Manage your assets securely.",
};

// 🧱 Root layout component
export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <head />
            <body
                className={`${geistSans.variable} ${geistMono.variable} ${oleo.variable} antialiased`}
            >
                {children}
                <Footer />
            </body>
        </html>
    );
}

