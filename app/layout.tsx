// app/layout.tsx
import "./globals.css";
import { Oleo_Script } from "next/font/google";
import type { ReactNode } from "react";
import Providers from "./providers";
import LayoutClient from "../components/layout/LayoutClient";
import { WalletConnectErrorFilter } from "../components/system/WalletConnectErrorFilter";

const oleo = Oleo_Script({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-oleo",
});

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={`${oleo.variable} antialiased min-h-screen flex flex-col bg-neutral-950 text-white`}>
        <Providers>
          <WalletConnectErrorFilter />
          <LayoutClient>{children}</LayoutClient>
        </Providers>
      </body>
    </html>
  );
}
