import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"

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
    <html lang="en" className="h-full">
      <body suppressHydrationWarning className={`${geist.className} ${geistMono.variable} h-full text-gray-900 antialiased`}>
        {children}
      </body>
    </html>
  )
}
