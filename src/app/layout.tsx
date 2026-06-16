import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"
import { THEME_INIT_SCRIPT } from "@/lib/theme"

const geist = Geist({ subsets: ["latin"] })
// Geist Mono for numeric figures (dashboard, tables, reports) — exposed as a CSS var
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" })

export const metadata: Metadata = {
  title: "GS Energy Solar ERP",
  description: "Enterprise Resource Planning for GS Energy Systems (Private) Limited",
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
      <body suppressHydrationWarning className={`${geist.className} ${geistMono.variable} h-full text-foreground antialiased`}>
        {children}
      </body>
    </html>
  )
}
