"use client"

import { Fragment, useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { AnimatePresence, motion } from "motion/react"
import { Search, ChevronDown, ChevronRight, LogOut, UserRound, PanelLeftClose, PanelLeftOpen, Menu, RotateCw } from "lucide-react"
import { clsx } from "clsx"
import { ThemeToggle } from "@/components/layout/ThemeToggle"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"
import { Modal } from "@/components/ui/Modal"
import { useRefreshRegistry } from "@/components/refresh/RefreshProvider"
import { TOPBAR_SURFACE } from "@/lib/surfaces"
import { portalNavItems, portalTrail } from "@/components/portal/portalNav"

interface PortalTopBarProps {
  customerName: string
  userName: string
  userEmail: string
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
  onOpenMobileSidebar?: () => void
}

function initials(name: string) {
  return name.split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()
}

export function PortalTopBar({ customerName, userName, userEmail, sidebarCollapsed, onToggleSidebar, onOpenMobileSidebar }: PortalTopBarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const trail = useMemo(() => portalTrail(pathname), [pathname])
  const { refreshAll, refreshing } = useRefreshRegistry()

  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const [isMac, setIsMac] = useState(false)
  useEffect(() => {
    const nav = navigator as Navigator & { userAgentData?: { platform?: string } }
    setIsMac(/mac/i.test(nav.userAgentData?.platform || nav.platform || nav.userAgent || ""))
  }, [])

  // ⌘K / Ctrl+K opens search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setSearchOpen((o) => !o)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

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
      await fetch("/api/portal/auth/logout", { method: "POST" })
      router.replace("/portal/login")
      router.refresh()
    } finally {
      setLoggingOut(false)
    }
  }

  const results = portalNavItems.filter((it) => it.label.toLowerCase().includes(query.toLowerCase()))

  return (
    <>
      <div className="no-print sticky top-0 z-30 border-b border-white/10" style={TOPBAR_SURFACE}>
        <div className="flex h-[4.25rem] items-center justify-between gap-4 px-5">
          {/* Left — toggles + breadcrumbs */}
          <div className="flex min-w-0 items-center gap-2.5">
            <button type="button" onClick={onOpenMobileSidebar} title="Open menu" aria-label="Open menu" className="shrink-0 rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white lg:hidden">
              <Menu size={20} />
            </button>
            <button type="button" onClick={onToggleSidebar} title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} className="hidden shrink-0 rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white lg:inline-flex">
              {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            </button>
            {trail.length > 0 && (
              <>
                <span className="hidden h-5 w-px shrink-0 bg-white/10 sm:block" />
                <nav className="hidden min-w-0 items-center gap-1.5 text-[13px] text-slate-400 sm:flex">
                  {trail.map((label, i) => (
                    <Fragment key={`${label}-${i}`}>
                      {i > 0 && <ChevronRight size={13} className="shrink-0 text-slate-600" />}
                      <span className={clsx("truncate", i === trail.length - 1 && "font-medium text-white")}>{label}</span>
                    </Fragment>
                  ))}
                </nav>
              </>
            )}
          </div>

          {/* Right — search + refresh + theme + profile */}
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setSearchOpen(true)} aria-label="Search" className="group hidden w-48 items-center gap-2.5 rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-slate-400 transition-all hover:border-white/20 hover:bg-white/10 hover:text-slate-300 sm:flex md:w-64">
              <Search size={15} className="shrink-0" />
              <span className="flex-1 text-left">Search…</span>
              <kbd className="rounded-md border border-white/10 bg-white/10 px-1.5 py-0.5 text-[11px] font-medium text-slate-400">{isMac ? "⌘K" : "Ctrl K"}</kbd>
            </button>
            <button type="button" onClick={() => setSearchOpen(true)} aria-label="Search" className="shrink-0 rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white sm:hidden">
              <Search size={18} />
            </button>

            <button type="button" onClick={refreshAll} title="Refresh data" aria-label="Refresh data" className="shrink-0 rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white">
              <RotateCw size={18} className={refreshing ? "animate-spin" : ""} />
            </button>

            <ThemeToggle />

            {/* Profile */}
            <div className="relative shrink-0" ref={menuRef}>
              <button type="button" onClick={() => setMenuOpen((o) => !o)} className={clsx("flex items-center gap-2.5 rounded-full py-1 pl-1 pr-2.5 transition-colors", menuOpen ? "bg-white/10" : "hover:bg-white/10")}>
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-[11px] font-bold text-white shadow-md">{initials(userName || customerName)}</span>
                <span className="hidden text-left sm:block">
                  <span className="block text-[13px] font-semibold leading-tight text-white">{customerName}</span>
                  <span className="block text-[11px] leading-tight text-slate-400">Customer</span>
                </span>
                <ChevronDown size={14} className={clsx("text-slate-400 transition-transform duration-200", menuOpen && "rotate-180")} />
              </button>

              <AnimatePresence>
                {menuOpen && (
                  <motion.div initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.98 }} transition={{ duration: 0.15, ease: "easeOut" }} className="absolute right-0 z-40 mt-2 w-72 origin-top-right overflow-hidden rounded-xl border border-line bg-elevated shadow-pop">
                    <div className="flex items-center gap-3 border-b border-line bg-muted/60 px-4 py-3.5">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-xs font-bold text-white shadow-md">{initials(userName || customerName)}</span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{userName}</p>
                        <p className="truncate text-xs text-secondary">{userEmail}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 text-xs text-secondary"><UserRound size={13} /> Account</span>
                      <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-600/15 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/25">{customerName}</span>
                    </div>
                    <div className="p-1.5">
                      <button type="button" onClick={() => { setMenuOpen(false); router.push("/portal/profile") }} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-secondary transition-colors hover:bg-muted hover:text-foreground">
                        <UserRound size={15} /> My Profile
                      </button>
                      <button type="button" onClick={() => { setMenuOpen(false); setConfirmOpen(true) }} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10">
                        <LogOut size={15} /> Sign out
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>

      {/* Search palette */}
      <Modal isOpen={searchOpen} onClose={() => { setSearchOpen(false); setQuery("") }} title="Search" size="sm">
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2">
            <Search size={15} className="text-tertiary" />
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Go to…" className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-tertiary" />
          </div>
          <div className="space-y-0.5">
            {results.length === 0 ? (
              <p className="px-2 py-3 text-sm text-tertiary">No matches.</p>
            ) : (
              results.map((it) => (
                <button key={it.href} type="button" onClick={() => { setSearchOpen(false); setQuery(""); router.push(it.href) }} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-secondary transition-colors hover:bg-muted hover:text-foreground">
                  <span className="text-tertiary">{it.icon}</span>
                  {it.label}
                </button>
              ))
            )}
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={confirmOpen}
        title="Sign out"
        message={`You'll be signed out of the Customer Portal${userName ? ` as ${userName}` : ""}. Continue?`}
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
