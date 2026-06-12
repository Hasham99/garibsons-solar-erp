import type { Metadata } from "next"
import { Figtree } from "next/font/google"
import "./globals.css"

const figtree = Figtree({ subsets: ["latin"] })

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
    <html lang="en" className="h-full">
      <body suppressHydrationWarning className={`${figtree.className} h-full bg-slate-50 text-gray-900 antialiased`}>
        {children}
      </body>
    </html>
  )
}
