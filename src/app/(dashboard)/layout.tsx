"use client"

import { useEffect, useState, useSyncExternalStore } from "react"
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
  const pathname = usePathname()

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

  // Mobile (< lg): the sidebar is an off-canvas drawer instead of a docked rail.
  const [mobileOpen, setMobileOpen] = useState(false)
  // Close the drawer when navigation changes the route (adjust state during
  // render — the pattern React recommends over a setState-in-effect).
  const [lastPath, setLastPath] = useState(pathname)
  if (pathname !== lastPath) {
    setLastPath(pathname)
    setMobileOpen(false)
  }
  // Lock body scroll while the drawer is open (syncing an external system).
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : ""
    return () => { document.body.style.overflow = "" }
  }, [mobileOpen])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <svg className="animate-spin h-8 w-8 text-blue-600 mx-auto" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="mt-3 text-sm text-secondary">Loading workspace…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop (lg+): docked rail that collapses to an icon strip */}
      <div
        data-sidebar
        className={`hidden lg:flex flex-shrink-0 flex-col transition-[width] duration-300 ease-in-out ${collapsed ? "w-[72px]" : "w-64"}`}
      >
        <Sidebar user={user} collapsed={collapsed} onToggle={toggleSidebar} />
      </div>

      {/* Mobile (< lg): off-canvas drawer + scrim */}
      <div className={`lg:hidden fixed inset-0 z-50 ${mobileOpen ? "" : "pointer-events-none"}`} aria-hidden={!mobileOpen}>
        <div
          className={`absolute inset-0 bg-slate-900/50 backdrop-blur-[2px] transition-opacity duration-300 ${mobileOpen ? "opacity-100" : "opacity-0"}`}
          onClick={() => setMobileOpen(false)}
        />
        <div
          className={`absolute inset-y-0 left-0 w-64 max-w-[82%] shadow-pop transition-transform duration-300 ease-out ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
        >
          <Sidebar user={user} collapsed={false} onToggle={() => setMobileOpen(false)} />
        </div>
      </div>

      <main className="flex-1 overflow-y-auto">
        <TopBar
          user={user}
          sidebarCollapsed={collapsed}
          onToggleSidebar={toggleSidebar}
          onOpenMobileSidebar={() => setMobileOpen(true)}
        />
        <div className="p-3 sm:p-5 max-w-7xl mx-auto">
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
