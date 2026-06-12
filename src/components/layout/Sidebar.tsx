"use client"

import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import {
  LayoutDashboard,
  Calculator,
  ShoppingCart,
  Warehouse,
  TrendingUp,
  FileText,
  Truck,
  Receipt,
  BookOpen,
  BarChart3,
  Package,
  Users,
  Building2,
  Settings,
  LogOut,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  Zap,
  Wallet,
  CreditCard,
  Globe,
  Banknote,
  LineChart,
  Boxes,
  Clock,
  ClipboardList,
} from "lucide-react"
import { clsx } from "clsx"

interface NavItem {
  label: string
  href?: string
  icon: React.ReactNode
  /* icon tint when the item is inactive — keeps the rail colorful but calm */
  accent?: string
  children?: NavItem[]
  roles?: string[]
}

interface NavSection {
  label: string
  items: NavItem[]
}

const MASTER_DATA_ROLES = ["ADMIN", "PROCUREMENT", "WAREHOUSE", "SALES", "ACCOUNTS", "VIEWER"]

const navSections: NavSection[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", href: "/", icon: <LayoutDashboard size={18} />, accent: "text-sky-400" },
      { label: "Costing Calculator", href: "/costing", icon: <Calculator size={18} />, accent: "text-violet-400" },
    ],
  },
  {
    label: "Procurement",
    items: [
      { label: "Purchase Orders", href: "/procurement", icon: <ShoppingCart size={18} />, accent: "text-amber-400", roles: ["ADMIN", "PROCUREMENT", "OPERATIONS", "CUSTOMER_MANAGER"] },
      { label: "Stock Register", href: "/stock", icon: <Warehouse size={18} />, accent: "text-orange-400", roles: ["ADMIN", "PROCUREMENT", "WAREHOUSE", "OPERATIONS", "CUSTOMER_MANAGER"] },
    ],
  },
  {
    label: "Sales",
    items: [
      { label: "Quotations", href: "/quotations", icon: <FileText size={18} />, accent: "text-cyan-400", roles: ["ADMIN", "SALES", "OPERATIONS", "CUSTOMER_MANAGER"] },
      { label: "Sales Orders", href: "/sales", icon: <TrendingUp size={18} />, accent: "text-emerald-400", roles: ["ADMIN", "SALES", "ACCOUNTS", "OPERATIONS", "CUSTOMER_MANAGER"] },
      { label: "Delivery Orders", href: "/delivery", icon: <Truck size={18} />, accent: "text-teal-400", roles: ["ADMIN", "WAREHOUSE", "SALES", "OPERATIONS", "CUSTOMER_MANAGER"] },
      { label: "Invoices", href: "/invoices", icon: <Receipt size={18} />, accent: "text-rose-400", roles: ["ADMIN", "ACCOUNTS", "OPERATIONS", "CUSTOMER_MANAGER"] },
    ],
  },
  {
    label: "Finance",
    items: [
      { label: "Party Ledger", href: "/ledger", icon: <BookOpen size={18} />, accent: "text-indigo-400", roles: ["ADMIN", "ACCOUNTS", "OPERATIONS", "CUSTOMER_MANAGER"] },
      { label: "Expenses", href: "/expenses", icon: <Wallet size={18} />, accent: "text-pink-400", roles: ["ADMIN", "ACCOUNTS", "OPERATIONS", "CUSTOMER_MANAGER"] },
      {
        label: "Reports",
        icon: <BarChart3 size={18} />,
        accent: "text-fuchsia-400",
        children: [
          { label: "Sales", href: "/reports?view=sales", icon: <TrendingUp size={16} />, accent: "text-emerald-400" },
          { label: "Receivables", href: "/reports?view=outstanding", icon: <Wallet size={16} />, accent: "text-sky-400" },
          { label: "Collections", href: "/reports?view=collections", icon: <Banknote size={16} />, accent: "text-green-400" },
          { label: "Profitability", href: "/reports?view=profit", icon: <LineChart size={16} />, accent: "text-fuchsia-400" },
          {
            label: "Stock",
            icon: <Boxes size={16} />,
            accent: "text-amber-400",
            children: [
              { label: "Stock Position", href: "/reports?view=stockPosition", icon: <Warehouse size={15} />, accent: "text-orange-400" },
              { label: "Stock Summary", href: "/reports?view=stock", icon: <Package size={15} />, accent: "text-blue-400" },
              { label: "Stock Aging", href: "/reports?view=stockAging", icon: <Clock size={15} />, accent: "text-yellow-400" },
            ],
          },
          {
            label: "Procurement",
            icon: <ShoppingCart size={16} />,
            accent: "text-orange-400",
            children: [
              { label: "PO Status", href: "/reports?view=poStatus", icon: <ClipboardList size={15} />, accent: "text-cyan-400" },
              { label: "Purchases", href: "/reports?view=purchases", icon: <Receipt size={15} />, accent: "text-rose-400" },
            ],
          },
        ],
      },
    ],
  },
  {
    label: "Administration",
    items: [
      {
        label: "Master Data",
        icon: <Package size={18} />,
        accent: "text-lime-400",
        children: [
          { label: "Products", href: "/masters/products", icon: <Zap size={16} />, accent: "text-yellow-400", roles: MASTER_DATA_ROLES },
          { label: "Suppliers", href: "/masters/suppliers", icon: <Building2 size={16} />, accent: "text-sky-400", roles: MASTER_DATA_ROLES },
          { label: "Customers", href: "/masters/customers", icon: <Users size={16} />, accent: "text-violet-400", roles: [...MASTER_DATA_ROLES, "CUSTOMER_MANAGER"] },
          { label: "Warehouses", href: "/masters/warehouses", icon: <Warehouse size={16} />, accent: "text-orange-400", roles: MASTER_DATA_ROLES },
        ],
      },
      {
        label: "Settings",
        icon: <Settings size={18} />,
        accent: "text-slate-400",
        roles: ["ADMIN"],
        children: [
          { label: "Users", href: "/settings/users", icon: <Users size={16} />, accent: "text-sky-400" },
          { label: "Tax Configs", href: "/settings/tax-configs", icon: <CreditCard size={16} />, accent: "text-rose-400" },
          { label: "Exchange Rates", href: "/settings/exchange-rates", icon: <Globe size={16} />, accent: "text-cyan-400" },
          { label: "Banks", href: "/settings/banks", icon: <Building2 size={16} />, accent: "text-indigo-400" },
        ],
      },
    ],
  },
]

interface SidebarProps {
  user: { name: string; email: string; role: string } | null
  collapsed: boolean
  onToggle: () => void
}

const DEFAULT_REPORT_VIEW = "outstanding"

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

export function Sidebar({ user, collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const currentView = searchParams.get("view")
  const [expandedGroups, setExpandedGroups] = useState<string[]>(["Reports", "Master Data", "Settings"])

  const toggleGroup = (label: string) => {
    setExpandedGroups((prev) =>
      prev.includes(label) ? prev.filter((g) => g !== label) : [...prev, label]
    )
  }

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" })
    router.push("/login")
    router.refresh()
  }

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/"
    // Report links share the /reports path — match on the ?view= param instead
    if (href.startsWith("/reports?")) {
      if (pathname !== "/reports") return false
      const view = new URLSearchParams(href.split("?")[1]).get("view")
      return (currentView || DEFAULT_REPORT_VIEW) === view
    }
    return pathname.startsWith(href)
  }

  // A group is "active" when any descendant leaf (at any depth) is active
  const descendantActive = (item: NavItem): boolean =>
    item.href ? isActive(item.href) : (item.children || []).some(descendantActive)

  // Auto-expand every ancestor group along the path to the active route
  useEffect(() => {
    const toExpand: string[] = []
    const walk = (items: NavItem[], ancestors: string[]) => {
      for (const it of items) {
        if (it.children) walk(it.children, [...ancestors, it.label])
        else if (it.href && isActive(it.href)) toExpand.push(...ancestors)
      }
    }
    for (const section of navSections) walk(section.items, [])
    if (toExpand.length) {
      setExpandedGroups((prev) => {
        const next = [...prev]
        for (const l of toExpand) if (!next.includes(l)) next.push(l)
        return next
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, currentView])

  const canView = (item: NavItem) => {
    if (!item.roles || !user) return true
    return item.roles.includes(user.role)
  }

  // Recursive nav renderer — supports leaf links and nested expandable groups
  const renderItem = (item: NavItem, depth: number): React.ReactNode => {
    if (!canView(item)) return null

    if (item.children) {
      const visibleChildren = item.children.filter(canView)
      if (visibleChildren.length === 0) return null

      const isExpanded = expandedGroups.includes(item.label) && !collapsed
      const hasActiveChild = visibleChildren.some(descendantActive)

      return (
        <div key={item.label}>
          <button
            onClick={() => {
              if (collapsed) {
                // From the icon rail, expand the sidebar and open this group
                onToggle()
                setExpandedGroups((prev) => (prev.includes(item.label) ? prev : [...prev, item.label]))
              } else {
                toggleGroup(item.label)
              }
            }}
            title={collapsed ? item.label : undefined}
            className={clsx(
              "w-full flex items-center rounded-lg transition-all duration-200",
              collapsed && depth === 0 ? "justify-center px-0 py-2.5" : "justify-between px-3 py-2",
              depth === 0 ? "text-sm font-medium" : "text-[13px]",
              hasActiveChild ? "text-white bg-white/10" : "text-slate-400 hover:text-white hover:bg-white/5"
            )}
          >
            <div className={clsx("flex items-center", !collapsed && "gap-3")}>
              <span className={clsx("transition-colors shrink-0", !hasActiveChild && item.accent)}>{item.icon}</span>
              {(!collapsed || depth > 0) && <span className="truncate">{item.label}</span>}
            </div>
            {(!collapsed || depth > 0) && (
              <ChevronDown
                size={14}
                className={clsx("shrink-0 transition-transform duration-200", !isExpanded && "-rotate-90")}
              />
            )}
          </button>
          {!collapsed && (
            <div
              className={clsx(
                "grid transition-[grid-template-rows] duration-200 ease-out",
                isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
              )}
            >
              <div className="overflow-hidden">
                <div className="mt-1 ml-3 space-y-0.5 border-l border-white/10 pl-2 pb-0.5">
                  {visibleChildren.map((child) => renderItem(child, depth + 1))}
                </div>
              </div>
            </div>
          )}
        </div>
      )
    }

    const active = isActive(item.href!)

    return (
      <Link
        key={item.href}
        href={item.href!}
        title={collapsed && depth === 0 ? item.label : undefined}
        className={clsx(
          "relative flex items-center rounded-lg transition-all duration-200 group",
          collapsed && depth === 0 ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2",
          depth === 0 ? "text-sm font-medium" : "text-[13px]",
          active
            ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-md shadow-blue-950/40"
            : "text-slate-400 hover:text-white hover:bg-white/5"
        )}
      >
        {/* animated active indicator */}
        {active && !collapsed && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full bg-white/80 animate-scale-in" />
        )}
        <span
          className={clsx(
            "transition-all duration-200 shrink-0",
            !active && item.accent,
            !active && "group-hover:scale-110"
          )}
        >
          {item.icon}
        </span>
        {(!collapsed || depth > 0) && <span className="truncate">{item.label}</span>}
      </Link>
    )
  }

  return (
    <div className="relative flex flex-col h-full bg-gradient-to-b from-[#0e1526] to-[#141d33] border-r border-white/5">
      {/* Collapse toggle — floats on the sidebar edge */}
      <button
        onClick={onToggle}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="absolute -right-3 top-7 z-20 h-6 w-6 rounded-full bg-white border border-slate-200 shadow-md flex items-center justify-center text-slate-500 hover:text-blue-600 hover:border-blue-300 transition-colors no-print"
      >
        {collapsed ? <ChevronsRight size={13} /> : <ChevronsLeft size={13} />}
      </button>

      {/* Logo */}
      <div className={clsx("border-b border-white/10 flex items-center", collapsed ? "justify-center px-2 py-4" : "px-5 py-4 gap-3")}>
        <div className="h-9 w-9 shrink-0 rounded-xl bg-white flex items-center justify-center shadow-lg shadow-black/30 p-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.png" alt="Garibsons" className="h-full w-full object-contain" />
        </div>
        {!collapsed && (
          <div className="min-w-0 animate-fade-in">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/gbs-logo-inverted.png" alt="Garibsons (Pvt) Ltd" className="h-4 w-auto object-contain" />
            <p className="text-blue-300/80 text-[11px] mt-1 tracking-wide font-medium">SOLAR ERP</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className={clsx("sidebar-scroll flex-1 py-4 overflow-y-auto overflow-x-hidden", collapsed ? "px-2.5" : "px-3")}>
        {navSections.map((section) => {
          const visible = section.items.filter(canView)
          if (visible.length === 0) return null
          return (
            <div key={section.label} className="mb-4 last:mb-0">
              {collapsed ? (
                <div className="mx-2 mb-2 border-t border-white/10" />
              ) : (
                <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  {section.label}
                </p>
              )}
              <div className="space-y-0.5">{visible.map((item) => renderItem(item, 0))}</div>
            </div>
          )
        })}
      </nav>

      {/* User info and logout */}
      <div className={clsx("border-t border-white/10 py-3", collapsed ? "px-2.5" : "px-3")}>
        {user && (
          <div className={clsx("flex items-center mb-1.5", collapsed ? "justify-center" : "gap-3 px-2 py-1.5")}>
            <div
              title={collapsed ? `${user.name} (${user.role})` : undefined}
              className="h-8 w-8 shrink-0 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-[11px] font-bold text-white shadow-md"
            >
              {initials(user.name)}
            </div>
            {!collapsed && (
              <div className="min-w-0 animate-fade-in">
                <p className="text-sm font-medium text-white truncate">{user.name}</p>
                <p className="text-[11px] text-slate-400 truncate capitalize">{user.role.toLowerCase().replace(/_/g, " ")}</p>
              </div>
            )}
          </div>
        )}
        <button
          onClick={handleLogout}
          title={collapsed ? "Logout" : undefined}
          className={clsx(
            "w-full flex items-center rounded-lg text-sm text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors",
            collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2"
          )}
        >
          <LogOut size={18} className="shrink-0" />
          {!collapsed && "Logout"}
        </button>
      </div>
    </div>
  )
}
