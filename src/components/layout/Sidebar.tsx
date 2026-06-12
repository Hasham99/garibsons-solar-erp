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
  ChevronRight,
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
  children?: NavItem[]
  roles?: string[]
}

const MASTER_DATA_ROLES = ["ADMIN", "PROCUREMENT", "WAREHOUSE", "SALES", "ACCOUNTS", "VIEWER"]

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/", icon: <LayoutDashboard size={18} /> },
  { label: "Costing Calculator", href: "/costing", icon: <Calculator size={18} /> },
  { label: "Purchase Orders", href: "/procurement", icon: <ShoppingCart size={18} />, roles: ["ADMIN", "PROCUREMENT", "OPERATIONS", "CUSTOMER_MANAGER"] },
  { label: "Stock Register", href: "/stock", icon: <Warehouse size={18} />, roles: ["ADMIN", "PROCUREMENT", "WAREHOUSE", "OPERATIONS", "CUSTOMER_MANAGER"] },
  { label: "Quotations", href: "/quotations", icon: <FileText size={18} />, roles: ["ADMIN", "SALES", "OPERATIONS", "CUSTOMER_MANAGER"] },
  { label: "Sales Orders", href: "/sales", icon: <TrendingUp size={18} />, roles: ["ADMIN", "SALES", "ACCOUNTS", "OPERATIONS", "CUSTOMER_MANAGER"] },
  { label: "Delivery Orders", href: "/delivery", icon: <Truck size={18} />, roles: ["ADMIN", "WAREHOUSE", "SALES", "OPERATIONS", "CUSTOMER_MANAGER"] },
  { label: "Invoices", href: "/invoices", icon: <Receipt size={18} />, roles: ["ADMIN", "ACCOUNTS", "OPERATIONS", "CUSTOMER_MANAGER"] },
  { label: "Party Ledger", href: "/ledger", icon: <BookOpen size={18} />, roles: ["ADMIN", "ACCOUNTS", "OPERATIONS", "CUSTOMER_MANAGER"] },
  { label: "Expenses", href: "/expenses", icon: <Wallet size={18} />, roles: ["ADMIN", "ACCOUNTS", "OPERATIONS", "CUSTOMER_MANAGER"] },
  {
    label: "Reports",
    icon: <BarChart3 size={18} />,
    children: [
      // Single-report modules link straight to their page…
      { label: "Sales", href: "/reports?view=sales", icon: <TrendingUp size={16} /> },
      { label: "Receivables", href: "/reports?view=outstanding", icon: <Wallet size={16} /> },
      { label: "Collections", href: "/reports?view=collections", icon: <Banknote size={16} /> },
      { label: "Profitability", href: "/reports?view=profit", icon: <LineChart size={16} /> },
      // …multi-report modules expand into a nested submenu.
      {
        label: "Stock",
        icon: <Boxes size={16} />,
        children: [
          { label: "Stock Position", href: "/reports?view=stockPosition", icon: <Warehouse size={15} /> },
          { label: "Stock Summary", href: "/reports?view=stock", icon: <Package size={15} /> },
          { label: "Stock Aging", href: "/reports?view=stockAging", icon: <Clock size={15} /> },
        ],
      },
      {
        label: "Procurement",
        icon: <ShoppingCart size={16} />,
        children: [
          { label: "PO Status", href: "/reports?view=poStatus", icon: <ClipboardList size={15} /> },
          { label: "Purchases", href: "/reports?view=purchases", icon: <Receipt size={15} /> },
        ],
      },
    ],
  },
  {
    label: "Master Data",
    icon: <Package size={18} />,
    children: [
      { label: "Products", href: "/masters/products", icon: <Zap size={16} />, roles: MASTER_DATA_ROLES },
      { label: "Suppliers", href: "/masters/suppliers", icon: <Building2 size={16} />, roles: MASTER_DATA_ROLES },
      { label: "Customers", href: "/masters/customers", icon: <Users size={16} />, roles: [...MASTER_DATA_ROLES, "CUSTOMER_MANAGER"] },
      { label: "Warehouses", href: "/masters/warehouses", icon: <Warehouse size={16} />, roles: MASTER_DATA_ROLES },
    ],
  },
  {
    label: "Settings",
    icon: <Settings size={18} />,
    roles: ["ADMIN"],
    children: [
      { label: "Users", href: "/settings/users", icon: <Users size={16} /> },
      { label: "Tax Configs", href: "/settings/tax-configs", icon: <CreditCard size={16} /> },
      { label: "Exchange Rates", href: "/settings/exchange-rates", icon: <Globe size={16} /> },
      { label: "Banks", href: "/settings/banks", icon: <Building2 size={16} /> },
    ],
  },
]

interface SidebarProps {
  user: { name: string; email: string; role: string } | null
}

const DEFAULT_REPORT_VIEW = "outstanding"

export function Sidebar({ user }: SidebarProps) {
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
    walk(navItems, [])
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

      const isExpanded = expandedGroups.includes(item.label)
      const hasActiveChild = visibleChildren.some(descendantActive)

      return (
        <div key={item.label}>
          <button
            onClick={() => toggleGroup(item.label)}
            className={clsx(
              "w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors",
              depth === 0 ? "text-sm font-medium" : "text-[13px]",
              hasActiveChild ? "text-white bg-white/10" : "text-gray-400 hover:text-white hover:bg-white/5"
            )}
          >
            <div className="flex items-center gap-3">
              {item.icon}
              {item.label}
            </div>
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          {isExpanded && (
            <div className="mt-1 ml-3 space-y-1 border-l border-white/10 pl-2">
              {visibleChildren.map((child) => renderItem(child, depth + 1))}
            </div>
          )}
        </div>
      )
    }

    return (
      <Link
        key={item.href}
        href={item.href!}
        className={clsx(
          "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors",
          depth === 0 ? "text-sm font-medium" : "text-[13px]",
          isActive(item.href!)
            ? "bg-blue-600 text-white font-medium"
            : "text-gray-400 hover:text-white hover:bg-white/5"
        )}
      >
        {item.icon}
        {item.label}
      </Link>
    )
  }

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: "#1e2533" }}>
      {/* Logo */}
      <div className="px-6 py-5 border-b border-white/10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/gbs-logo-inverted.png" alt="Garibsons (Pvt) Ltd" className="h-5 w-auto object-contain" />
        <p className="text-blue-300 text-xs mt-2">Solar ERP</p>
      </div>

      {/* Navigation */}
      <nav className="sidebar-scroll flex-1 px-3 py-4 overflow-y-auto space-y-1">
        {navItems.map((item) => renderItem(item, 0))}
      </nav>

      {/* User info and logout */}
      <div className="px-3 py-4 border-t border-white/10">
        {user && (
          <div className="px-3 py-2 mb-2">
            <p className="text-sm font-medium text-white truncate">{user.name}</p>
            <p className="text-xs text-gray-400 truncate">{user.role}</p>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
        >
          <LogOut size={18} />
          Logout
        </button>
      </div>
    </div>
  )
}
