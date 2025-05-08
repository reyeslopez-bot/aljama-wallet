// app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";
import { Oleo_Script } from "next/font/google";
import LayoutClient from "../LayoutClient";
import Footer from "@/components/Footer";

// Default export from WalletDrawer.tsx:
import WalletDrawerProvider from "@/components/wallet/WalletDrawer";

export const metadata: Metadata = { title: "...", description: "..." };
const oleo = Oleo_Script({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-oleo" });

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body className={`${oleo.variable} antialiased min-h-screen flex flex-col`}>
                <WalletDrawerProvider>
                    <LayoutClient>{children}</LayoutClient>
                    <Footer />
                </WalletDrawerProvider>
            </body>
        </html>
    );
}

