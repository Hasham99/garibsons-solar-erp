"use client"

import { ReactNode, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion } from "motion/react"
import { Search, CornerDownLeft, Users, TrendingUp, Package, Truck, ShoppingCart, FileText, Receipt, Banknote, Loader2 } from "lucide-react"
import { clsx } from "clsx"
import { navSections, NavItem } from "@/components/layout/Sidebar"
import { formatCurrency } from "@/lib/utils"
import { can, type Access, type PermMap } from "@/lib/permissions/modules"

interface Command {
  label: string
  href: string
  icon: ReactNode
  /** Breadcrumb-style location, e.g. "Finance → Reports → Stock" */
  path: string
}

type PaletteUser = { name: string; email: string; role: string; fullAccess?: boolean; perms?: PermMap } | null

function flattenNav(user: PaletteUser): Command[] {
  const access: Access | null = user ? { fullAccess: Boolean(user.fullAccess), perms: user.perms ?? {} } : null
  const commands: Command[] = []
  const walk = (items: NavItem[], trail: string[]) => {
    for (const item of items) {
      // Skip modules the user can't read (and their descendants).
      if (item.module && !can(access, item.module, "read")) continue
      if (item.children) {
        walk(item.children, [...trail, item.label])
      } else if (item.href) {
        commands.push({
          label: item.label,
          href: item.href,
          icon: item.icon,
          path: trail.join(" → "),
        })
      }
    }
  }
  for (const section of navSections) walk(section.items, [section.label])
  return commands
}

interface CommandPaletteProps {
  isOpen: boolean
  onClose: () => void
  user: PaletteUser
}

export function CommandPalette({ isOpen, onClose, user }: CommandPaletteProps) {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [isOpen])

  if (!mounted) return null

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        // Content mounts fresh on every open, so query/highlight reset for free
        <PaletteContent onClose={onClose} user={user} />
      )}
    </AnimatePresence>,
    document.body
  )
}

interface SearchResponse {
  customers: Array<{ id: string; name: string; contactPhone: string | null }>
  salesOrders: Array<{ id: string; soNumber: string; grandTotal: number; customer: { id: string; name: string } }>
  deliveryOrders: Array<{ id: string; doNumber: string; status: string; quantity: number; salesOrder: { soNumber: string; customer: { id: string; name: string } } }>
  purchaseOrders: Array<{ id: string; poNumber: string; status: string; supplier: { name: string } }>
  quotations: Array<{ id: string; qNumber: string; status: string; customer: { name: string } }>
  invoices: Array<{ id: string; invoiceNumber: string; grandTotal: number; salesOrder: { customer: { name: string } } }>
  receipts: Array<{ id: string; receiptNo: string; amount: number; customer: { id: string; name: string } }>
  products: Array<{ id: string; name: string; code: string }>
}

function PaletteContent({ onClose, user }: { onClose: () => void; user: CommandPaletteProps["user"] }) {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  // Results carry the query they answered, so stale hits never show for a newer query
  const [recordData, setRecordData] = useState<{ q: string; hits: Command[] } | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const commands = useMemo(() => flattenNav(user), [user])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands
    return commands.filter(
      (c) => c.label.toLowerCase().includes(q) || c.path.toLowerCase().includes(q)
    )
  }, [commands, query])

  // Debounced record search (customers, sales orders, products)
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) return
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
        if (!res.ok) {
          setRecordData({ q, hits: [] })
          return
        }
        const d: SearchResponse = await res.json()
        // Only surface records for modules the user can read.
        const access: Access = { fullAccess: Boolean(user?.fullAccess), perms: user?.perms ?? {} }
        const show = (m: Parameters<typeof can>[1]) => can(access, m, "read")
        const hits: Command[] = [
          ...(show("masters.customers")
            ? d.customers.map((c) => ({
                label: c.name,
                href: `/masters/customers/${c.id}`,
                icon: <Users size={16} />,
                path: `Customer${c.contactPhone ? ` · ${c.contactPhone}` : ""}`,
              }))
            : []),
          ...(show("sales")
            ? d.salesOrders.map((s) => ({
                label: s.soNumber,
                href: `/masters/customers/${s.customer.id}`,
                icon: <TrendingUp size={16} />,
                path: `Sales Order · ${s.customer.name} · ${formatCurrency(s.grandTotal)}`,
              }))
            : []),
          ...(show("delivery")
            ? d.deliveryOrders.map((o) => ({
                label: o.doNumber,
                href: "/delivery",
                icon: <Truck size={16} />,
                path: `Delivery Order · ${o.salesOrder.customer.name} · ${o.quantity.toLocaleString()} panels · ${o.status.replace(/_/g, " ")}`,
              }))
            : []),
          ...(show("procurement")
            ? d.purchaseOrders.map((o) => ({
                label: o.poNumber,
                href: "/procurement",
                icon: <ShoppingCart size={16} />,
                path: `Purchase Order · ${o.supplier.name} · ${o.status.replace(/_/g, " ")}`,
              }))
            : []),
          ...(show("quotations")
            ? d.quotations.map((o) => ({
                label: o.qNumber,
                href: "/quotations",
                icon: <FileText size={16} />,
                path: `Quotation · ${o.customer.name} · ${o.status.replace(/_/g, " ")}`,
              }))
            : []),
          ...(show("invoices")
            ? d.invoices.map((o) => ({
                label: o.invoiceNumber,
                href: "/invoices",
                icon: <Receipt size={16} />,
                path: `Invoice · ${o.salesOrder.customer.name} · ${formatCurrency(o.grandTotal)}`,
              }))
            : []),
          ...(show("ledger")
            ? d.receipts.map((r) => ({
                label: r.receiptNo,
                href: `/masters/customers/${r.customer.id}/receipts`,
                icon: <Banknote size={16} />,
                path: `Receipt · ${r.customer.name} · ${formatCurrency(r.amount)}`,
              }))
            : []),
          ...(show("masters.products")
            ? d.products.map((p) => ({
                label: p.name,
                href: "/masters/products",
                icon: <Package size={16} />,
                path: `Product · ${p.code}`,
              }))
            : []),
        ]
        setRecordData({ q, hits })
      } catch {
        // Network hiccup — resolve the spinner to an empty result rather than hanging
        setRecordData({ q, hits: [] })
      }
    }, 250)
    return () => clearTimeout(t)
  }, [query, user?.fullAccess, user?.perms])

  const records = query.trim().length >= 2 && recordData?.q === query.trim() ? recordData.hits : []
  // A record search is in flight whenever the shown results don't answer the current query yet
  const searching = query.trim().length >= 2 && recordData?.q !== query.trim()
  const items = [...filtered, ...records]

  // Derive the highlight instead of clamping via effect
  const activeIdx = items.length === 0 ? 0 : Math.min(active, items.length - 1)

  // Keep the highlighted row visible while arrowing through results
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${activeIdx}"]`)
      ?.scrollIntoView({ block: "nearest" })
  }, [activeIdx])

  const run = (cmd: Command) => {
    onClose()
    router.push(cmd.href)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActive(Math.min(activeIdx + 1, items.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActive(Math.max(activeIdx - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      if (items[activeIdx]) run(items[activeIdx])
    } else if (e.key === "Escape") {
      onClose()
    }
  }

  const renderRow = (cmd: Command, idx: number) => (
    <button
      key={`${cmd.href}-${cmd.label}`}
      data-index={idx}
      onClick={() => run(cmd)}
      onMouseMove={() => setActive(idx)}
      className={clsx(
        "w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
        idx === activeIdx ? "bg-blue-50 text-blue-900" : "text-slate-700"
      )}
    >
      <span className={clsx("shrink-0", idx === activeIdx ? "text-blue-600" : "text-slate-400")}>
        {cmd.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{cmd.label}</span>
        <span className={clsx("block truncate text-xs", idx === activeIdx ? "text-blue-500/80" : "text-slate-400")}>
          {cmd.path}
        </span>
      </span>
      {idx === activeIdx && <CornerDownLeft size={14} className="shrink-0 text-blue-400" />}
    </button>
  )

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[16vh] px-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: -10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: -6 }}
        transition={{ type: "spring", duration: 0.3, bounce: 0.15 }}
        className="relative w-full max-w-xl rounded-2xl bg-white shadow-pop overflow-hidden"
      >
        <div className="flex items-center gap-3 border-b border-slate-100 px-4">
          <Search size={17} className="shrink-0 text-slate-400" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={onKeyDown}
            placeholder="Search pages…"
            className="w-full bg-transparent py-3.5 text-[15px] text-slate-900 placeholder-slate-400 focus:outline-none"
          />
          <kbd className="shrink-0 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-400">
            esc
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[46vh] overflow-y-auto p-2">
          {items.length === 0 ? (
            searching ? (
              <div className="flex items-center justify-center gap-2.5 px-3 py-8 text-sm text-slate-400">
                <Loader2 size={16} className="animate-spin" />
                Searching records…
              </div>
            ) : (
              <p className="px-3 py-8 text-center text-sm text-slate-400">
                Nothing matches &ldquo;{query}&rdquo;
              </p>
            )
          ) : (
            <>
              {filtered.length > 0 && (
                <>
                  {(records.length > 0 || searching) && (
                    <p className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Pages
                    </p>
                  )}
                  {filtered.map((cmd, idx) => renderRow(cmd, idx))}
                </>
              )}
              {records.length > 0 && (
                <>
                  <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Records
                  </p>
                  {records.map((cmd, idx) => renderRow(cmd, filtered.length + idx))}
                </>
              )}
              {searching && (
                <div className="flex items-center gap-2 px-3 py-2.5 text-xs text-slate-400">
                  <Loader2 size={13} className="animate-spin" />
                  Searching records…
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-4 border-t border-slate-100 bg-slate-50/60 px-4 py-2.5 text-[11px] text-slate-400">
          <span><kbd className="font-sans">↑↓</kbd> navigate</span>
          <span><kbd className="font-sans">↵</kbd> open</span>
          <span><kbd className="font-sans">esc</kbd> close</span>
        </div>
      </motion.div>
    </div>
  )
}
