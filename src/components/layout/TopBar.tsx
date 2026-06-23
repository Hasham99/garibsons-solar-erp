"use client"

import { Fragment, useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { AnimatePresence, motion } from "motion/react"
import { Search, ChevronDown, ChevronRight, LogOut, UserRound, PanelLeftClose, PanelLeftOpen, Menu, RotateCw } from "lucide-react"
import { clsx } from "clsx"
import { CommandPalette } from "@/components/layout/CommandPalette"
import { NotificationBell } from "@/components/layout/NotificationBell"
import { ThemeToggle } from "@/components/layout/ThemeToggle"
import { navSections, NavItem } from "@/components/layout/Sidebar"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"
import { useLookups } from "@/components/lookups/LookupsProvider"
import { useRefreshRegistry } from "@/components/refresh/RefreshProvider"
import { TOPBAR_SURFACE } from "@/lib/surfaces"

const DEFAULT_REPORT_VIEW = "outstanding"

/**
 * Derive the breadcrumb trail (e.g. ["Sales", "Quotations"]) from the nav tree.
 * Dynamic subpages (e.g. /masters/customers/[id]/receipts) fall back to their
 * closest ancestor leaf. Returns the most specific match.
 */
function findTrail(pathname: string, currentView: string | null): string[] {
  let best: { trail: string[]; specificity: number } | null = null

  const matches = (href: string): number => {
    if (href === "/") return pathname === "/" ? 1 : 0
    if (href.startsWith("/reports?")) {
      if (pathname !== "/reports") return 0
      const view = new URLSearchParams(href.split("?")[1]).get("view")
      return (currentView || DEFAULT_REPORT_VIEW) === view ? href.length : 0
    }
    return pathname.startsWith(href) ? href.length : 0
  }

  const walk = (items: NavItem[], trail: string[]) => {
    for (const item of items) {
      if (item.children) {
        walk(item.children, [...trail, item.label])
      } else if (item.href) {
        const specificity = matches(item.href)
        if (specificity > 0 && (!best || specificity > best.specificity)) {
          best = { trail: [...trail, item.label], specificity }
        }
      }
    }
  }
  for (const section of navSections) walk(section.items, [section.label])
  return best ? (best as { trail: string[] }).trail : []
}

interface TopBarProps {
  user: { name: string; email: string; role: string; fullAccess?: boolean; perms?: import("@/lib/permissions/modules").PermMap } | null
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
  /** Opens the off-canvas drawer on mobile (< lg). */
  onOpenMobileSidebar?: () => void
}

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

export function TopBar({ user, sidebarCollapsed, onToggleSidebar, onOpenMobileSidebar }: TopBarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const currentView = searchParams.get("view")
  const trail = useMemo(() => findTrail(pathname, currentView), [pathname, currentView])
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const { refresh: refreshLookups } = useLookups()
  const { refreshAll, refreshing } = useRefreshRegistry()

  // Re-pull the shared lookup caches AND whatever the current page fetched.
  const handleRefresh = () => {
    refreshLookups()
    refreshAll()
  }

  // Global ⌘K / Ctrl+K shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  // Close the profile menu on outside click / Escape
  useEffect(() => {
    if (!menuOpen) return
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false)
    document.addEventListener("mousedown", onClick)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onClick)
      document.removeEventListener("keydown", onKey)
    }
  }, [menuOpen])

  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      await fetch("/api/auth/logout", { method: "POST" })
      router.push("/login")
      router.refresh()
    } finally {
      setLoggingOut(false)
    }
  }

  // Platform-aware shortcut hint. Default to non-Mac ("Ctrl K") so SSR and
  // Windows render correctly; flip to ⌘ only after detecting macOS on the
  // client (prefers the modern userAgentData, falls back to platform/UA).
  const [isMac, setIsMac] = useState(false)
  useEffect(() => {
    const nav = navigator as Navigator & { userAgentData?: { platform?: string } }
    const platform = nav.userAgentData?.platform || nav.platform || nav.userAgent || ""
    setIsMac(/mac/i.test(platform))
  }, [])

  return (
    <>
      {/* h-[68px] matches the sidebar logo section (36px logo + 32px padding) so the bottom borders align */}
      <div className="no-print sticky top-0 z-30 border-b border-white/10" style={TOPBAR_SURFACE}>
        <div className="flex h-[4.25rem] items-center justify-between gap-4 px-5">
          {/* Left cluster — toggle + breadcrumbs */}
          <div className="flex min-w-0 items-center gap-2.5">
            {/* Mobile: open the off-canvas drawer */}
            <button
              type="button"
              onClick={onOpenMobileSidebar}
              title="Open menu"
              aria-label="Open menu"
              className="lg:hidden shrink-0 rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
            >
              <Menu size={20} />
            </button>
            {/* Desktop: collapse / expand the docked rail */}
            <button
              type="button"
              onClick={onToggleSidebar}
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="hidden lg:inline-flex shrink-0 rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
            >
              {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            </button>

            {trail.length > 0 && (
              <>
                <span className="h-5 w-px shrink-0 bg-white/10" />
                <nav className="flex min-w-0 items-center gap-1.5 text-[13px] text-slate-400">
                  {trail.map((label, i) => (
                    <Fragment key={`${label}-${i}`}>
                      {i > 0 && <ChevronRight size={13} className="shrink-0 text-slate-600" />}
                      <span
                        className={clsx(
                          "truncate",
                          i === trail.length - 1 && "font-medium text-white"
                        )}
                      >
                        {label}
                      </span>
                    </Fragment>
                  ))}
                </nav>
              </>
            )}
          </div>

          {/* Right cluster — search + profile */}
          <div className="flex items-center gap-3">
            {/* Search trigger — full faux-input on sm+, icon-only on mobile. Opens the command palette. */}
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              aria-label="Search"
              className="hidden sm:flex group w-48 md:w-64 items-center gap-2.5 rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-slate-400 transition-all hover:border-white/20 hover:bg-white/10 hover:text-slate-300"
            >
              <Search size={15} className="shrink-0" />
              <span className="flex-1 text-left">Search…</span>
              <kbd className="rounded-md border border-white/10 bg-white/10 px-1.5 py-0.5 text-[11px] font-medium text-slate-400">
                {isMac ? "⌘K" : "Ctrl K"}
              </kbd>
            </button>
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              aria-label="Search"
              className="sm:hidden shrink-0 rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
            >
              <Search size={18} />
            </button>

            <button
              type="button"
              onClick={handleRefresh}
              title="Refresh data"
              aria-label="Refresh data"
              className="shrink-0 rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
            >
              <RotateCw size={18} className={refreshing ? "animate-spin" : ""} />
            </button>

            <ThemeToggle />

            <NotificationBell />

            {/* Profile */}
            {user && (
            <div className="relative shrink-0" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                className={clsx(
                  "flex items-center gap-2.5 rounded-full py-1 pl-1 pr-2.5 transition-colors",
                  menuOpen ? "bg-white/10" : "hover:bg-white/10"
                )}
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-[11px] font-bold text-white shadow-md">
                  {initials(user.name)}
                </span>
                <span className="hidden sm:block text-left">
                  <span className="block text-[13px] font-semibold leading-tight text-white">{user.name}</span>
                  <span className="block text-[11px] leading-tight text-slate-400 capitalize">
                    {user.role.toLowerCase().replace(/_/g, " ")}
                  </span>
                </span>
                <ChevronDown
                  size={14}
                  className={clsx("text-slate-400 transition-transform duration-200", menuOpen && "rotate-180")}
                />
              </button>

              <AnimatePresence>
                {menuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.98 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    className="absolute right-0 z-40 mt-2 w-72 origin-top-right overflow-hidden rounded-xl border border-line bg-elevated shadow-pop"
                  >
                    {/* Profile details */}
                    <div className="flex items-center gap-3 border-b border-line bg-muted/60 px-4 py-3.5">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-xs font-bold text-white shadow-md">
                        {initials(user.name)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{user.name}</p>
                        <p className="truncate text-xs text-secondary">{user.email}</p>
                      </div>
                    </div>
                    <div className="px-4 py-3 flex items-center justify-between gap-2 border-b border-line">
                      <span className="inline-flex items-center gap-1.5 text-xs text-secondary">
                        <UserRound size={13} />
                        Role
                      </span>
                      <span className="inline-flex items-center rounded-full bg-blue-50 dark:bg-blue-500/10 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300 ring-1 ring-inset ring-blue-600/15 dark:ring-blue-500/25 capitalize">
                        {user.role.toLowerCase().replace(/_/g, " ")}
                      </span>
                    </div>
                    <div className="p-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false)
                          router.push("/profile")
                        }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-secondary transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <UserRound size={15} />
                        My Profile
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false)
                          setConfirmOpen(true)
                        }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-rose-600 dark:text-rose-400 transition-colors hover:bg-rose-50 dark:hover:bg-rose-500/10"
                      >
                        <LogOut size={15} />
                        Sign out
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            )}
          </div>
        </div>
      </div>

      <CommandPalette isOpen={paletteOpen} onClose={() => setPaletteOpen(false)} user={user} />

      <ConfirmDialog
        isOpen={confirmOpen}
        title="Sign out"
        message={`You'll be signed out of Garibsons Solar ERP${user ? ` as ${user.name}` : ""}. Continue?`}
        confirmLabel="Sign out"
        cancelLabel="Stay signed in"
        variant="danger"
        loading={loggingOut}
        onConfirm={handleLogout}
        onClose={() => setConfirmOpen(false)}
      />
    </>
  )
}
