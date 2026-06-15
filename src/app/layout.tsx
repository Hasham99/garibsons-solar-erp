import type { Metadata } from "next"
import { Figtree, Space_Mono } from "next/font/google"
import "./globals.css"
import { THEME_INIT_SCRIPT } from "@/lib/theme"

const figtree = Figtree({ subsets: ["latin"] })
// Mono font for numeric figures (dashboard, tables, reports) — exposed as a CSS var
const spaceMono = Space_Mono({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-space-mono" })

export const metadata: Metadata = {
  title: "Garibsons Solar ERP",
  description: "Enterprise Resource Planning for Garibsons Private Limited",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        {/* Applies the saved/OS theme before first paint so there's no flash */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body suppressHydrationWarning className={`${figtree.className} ${spaceMono.variable} h-full text-foreground antialiased`}>
        {children}
      </body>
    </html>
  )
}
