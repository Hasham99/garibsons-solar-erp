"use client"

import { useEffect, useState, useSyncExternalStore } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Toaster } from "react-hot-toast"
import { PortalAuthProvider, usePortalAuth } from "@/components/portal/PortalAuthProvider"
import { PortalSidebar } from "@/components/portal/PortalSidebar"
import { PortalTopBar } from "@/components/portal/PortalTopBar"
import { RefreshProvider } from "@/components/refresh/RefreshProvider"

const SIDEBAR_PREF_KEY = "gbs-portal-sidebar-collapsed"

const TOASTER = (
  <Toaster
    position="top-right"
    gutter={10}
    toastOptions={{
      duration: 3500,
      style: { background: "#0f172a", color: "#f8fafc", borderRadius: "12px", padding: "10px 14px", fontSize: "13.5px", boxShadow: "0 12px 32px -8px rgba(15, 23, 42, 0.4)" },
      success: { iconTheme: { primary: "#34d399", secondary: "#0f172a" } },
      error: { iconTheme: { primary: "#fb7185", secondary: "#0f172a" } },
    }}
  />
)

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalAuthProvider>
      <RefreshProvider>
        <PortalShell>{children}</PortalShell>
      </RefreshProvider>
    </PortalAuthProvider>
  )
}

function PortalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, customer, loading } = usePortalAuth()

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

  const [mobileOpen, setMobileOpen] = useState(false)
  const [lastPath, setLastPath] = useState(pathname)
  if (pathname !== lastPath) {
    setLastPath(pathname)
    setMobileOpen(false)
  }
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : ""
    return () => { document.body.style.overflow = "" }
  }, [mobileOpen])

  // Client-side guard (the proxy already enforces this server-side).
  useEffect(() => {
    if (pathname !== "/portal/login" && !loading && !user) router.replace("/portal/login")
  }, [pathname, loading, user, router])

  // The login page renders standalone (no chrome / no auth gate).
  if (pathname === "/portal/login") {
    return <>{children}{TOASTER}</>
  }

  if (loading || !user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <svg className="mx-auto h-8 w-8 animate-spin text-blue-600" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="mt-3 text-sm text-secondary">Loading…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop docked rail */}
      <div data-sidebar className={`hidden flex-shrink-0 flex-col transition-[width] duration-300 ease-in-out lg:flex ${collapsed ? "w-[72px]" : "w-64"}`}>
        <PortalSidebar collapsed={collapsed} onToggle={toggleSidebar} />
      </div>

      {/* Mobile off-canvas drawer */}
      <div className={`fixed inset-0 z-50 lg:hidden ${mobileOpen ? "" : "pointer-events-none"}`} aria-hidden={!mobileOpen}>
        <div className={`absolute inset-0 bg-slate-900/50 backdrop-blur-[2px] transition-opacity duration-300 ${mobileOpen ? "opacity-100" : "opacity-0"}`} onClick={() => setMobileOpen(false)} />
        <div className={`absolute inset-y-0 left-0 w-64 max-w-[82%] shadow-pop transition-transform duration-300 ease-out ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
          <PortalSidebar collapsed={false} onToggle={() => setMobileOpen(false)} />
        </div>
      </div>

      <main className="flex-1 overflow-y-auto">
        <PortalTopBar
          customerName={customer?.name || "Customer"}
          userName={user.name}
          userEmail={user.email}
          sidebarCollapsed={collapsed}
          onToggleSidebar={toggleSidebar}
          onOpenMobileSidebar={() => setMobileOpen(true)}
        />
        <div className="mx-auto max-w-7xl p-3 sm:p-5">{children}</div>
      </main>
      {TOASTER}
    </div>
  )
}
