// app/layout.tsx
import './globals.css'
import type { ReactNode } from 'react'
import Providers from './Providers.client'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col antialiased bg-background text-foreground">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
