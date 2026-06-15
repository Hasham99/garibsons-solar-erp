"use client"

import { Fragment, useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { AnimatePresence, motion } from "motion/react"
import { Search, ChevronDown, ChevronRight, LogOut, UserRound, PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { clsx } from "clsx"
import { CommandPalette } from "@/components/layout/CommandPalette"
import { NotificationBell } from "@/components/layout/NotificationBell"
import { navSections, NavItem } from "@/components/layout/Sidebar"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"

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

export function TopBar({ user, sidebarCollapsed, onToggleSidebar }: TopBarProps) {
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

  const isMac = typeof navigator !== "undefined" && navigator.platform.toUpperCase().includes("MAC")

  return (
    <>
      {/* h-[68px] matches the sidebar logo section (36px logo + 32px padding) so the bottom borders align */}
      <div className="no-print sticky top-0 z-30 border-b border-white/10 bg-gradient-to-r from-[#0e1526] to-[#141d33]">
        <div className="flex h-[4.25rem] items-center justify-between gap-4 px-5">
          {/* Left cluster — toggle + breadcrumbs */}
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              type="button"
              onClick={onToggleSidebar}
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="shrink-0 rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
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
            {/* Search trigger — looks like an input, opens the command palette */}
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="group flex w-48 sm:w-64 items-center gap-2.5 rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-slate-400 transition-all hover:border-white/20 hover:bg-white/10 hover:text-slate-300"
            >
              <Search size={15} className="shrink-0" />
              <span className="flex-1 text-left">Search…</span>
              <kbd className="rounded-md border border-white/10 bg-white/10 px-1.5 py-0.5 text-[11px] font-medium text-slate-400">
                {isMac ? "⌘K" : "Ctrl K"}
              </kbd>
            </button>

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
                    className="absolute right-0 z-40 mt-2 w-72 origin-top-right overflow-hidden rounded-xl border border-slate-200 bg-white shadow-pop"
                  >
                    {/* Profile details */}
                    <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/60 px-4 py-3.5">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-xs font-bold text-white shadow-md">
                        {initials(user.name)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">{user.name}</p>
                        <p className="truncate text-xs text-slate-500">{user.email}</p>
                      </div>
                    </div>
                    <div className="px-4 py-3 flex items-center justify-between gap-2 border-b border-slate-100">
                      <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                        <UserRound size={13} />
                        Role
                      </span>
                      <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-600/15 capitalize">
                        {user.role.toLowerCase().replace(/_/g, " ")}
                      </span>
                    </div>
                    <div className="p-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false)
                          setConfirmOpen(true)
                        }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50"
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
