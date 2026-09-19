import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Skylark BI Agent',
  description: 'Business Intelligence Agent for Skylark Drones',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:ital,wght@0,300;0,400;0,500;0,700;0,800;1,400&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-sans antialiased text-ghost min-h-screen">
        {children}
      </body>
    </html>
  )
}
