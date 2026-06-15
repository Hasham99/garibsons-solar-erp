"use client"

import { useState, useSyncExternalStore } from "react"
import { usePathname } from "next/navigation"
import { Toaster } from "react-hot-toast"
import { Sidebar } from "@/components/layout/Sidebar"
import { TopBar } from "@/components/layout/TopBar"
import { useAuth } from "@/hooks/useAuth"
import { useIdleTimeout } from "@/hooks/useIdleTimeout"
import { AuthProvider } from "@/components/auth/AuthProvider"
import { LookupsProvider } from "@/components/lookups/LookupsProvider"

const SIDEBAR_PREF_KEY = "gbs-sidebar-collapsed"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  // Print/preview pages render standalone — no sidebar, top bar, page padding,
  // or auth fetch — so the document fills the tab and prints cleanly.
  if (pathname?.endsWith("/print")) {
    return (
      <>
        {children}
        <Toaster position="top-right" toastOptions={{ duration: 3500 }} />
      </>
    )
  }

  // AuthProvider fetches the current user once and shares it with every page,
  // instead of each page re-fetching /api/auth/me.
  return (
    <AuthProvider>
      <LookupsProvider>
        <DashboardShell>{children}</DashboardShell>
      </LookupsProvider>
    </AuthProvider>
  )
}

function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  useIdleTimeout()

  // Stored preference, read hydration-safely (server snapshot: expanded).
  // Session toggles override it without re-reading storage.
  const stored = useSyncExternalStore(
    () => () => {},
    () => localStorage.getItem(SIDEBAR_PREF_KEY) === "1",
    () => false
  )
  const [override, setOverride] = useState<boolean | null>(null)
  const collapsed = override ?? stored

  const toggleSidebar = () => {
    const next = !collapsed
    localStorage.setItem(SIDEBAR_PREF_KEY, next ? "1" : "0")
    setOverride(next)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <svg className="animate-spin h-8 w-8 text-blue-600 mx-auto" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="mt-3 text-sm text-slate-500">Loading workspace…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <div
        data-sidebar
        className={`flex-shrink-0 flex flex-col transition-[width] duration-300 ease-in-out ${collapsed ? "w-[72px]" : "w-64"}`}
      >
        <Sidebar user={user} collapsed={collapsed} onToggle={toggleSidebar} />
      </div>
      <main className="flex-1 overflow-y-auto">
        <TopBar user={user} sidebarCollapsed={collapsed} onToggleSidebar={toggleSidebar} />
        <div className="p-5 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
      {/* One app-wide toaster — pages fire toast() without mounting their own */}
      <Toaster
        position="top-right"
        gutter={10}
        toastOptions={{
          duration: 3500,
          style: {
            background: "#0f172a",
            color: "#f8fafc",
            borderRadius: "12px",
            padding: "10px 14px",
            fontSize: "13.5px",
            boxShadow: "0 12px 32px -8px rgba(15, 23, 42, 0.4)",
          },
          success: { iconTheme: { primary: "#34d399", secondary: "#0f172a" } },
          error: { iconTheme: { primary: "#fb7185", secondary: "#0f172a" } },
        }}
      />
    </div>
  )
}
