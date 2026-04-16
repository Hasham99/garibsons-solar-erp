"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useState } from "react"
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
  CreditCard,
  Globe,
} from "lucide-react"
import { clsx } from "clsx"

interface NavItem {
  label: string
  href?: string
  icon: React.ReactNode
  children?: NavItem[]
  roles?: string[]
}

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/", icon: <LayoutDashboard size={18} /> },
  { label: "Costing Calculator", href: "/costing", icon: <Calculator size={18} /> },
  { label: "Purchase Orders", href: "/procurement", icon: <ShoppingCart size={18} />, roles: ["ADMIN", "PROCUREMENT"] },
  { label: "Stock Register", href: "/stock", icon: <Warehouse size={18} />, roles: ["ADMIN", "PROCUREMENT", "WAREHOUSE"] },
  { label: "Quotations", href: "/quotations", icon: <FileText size={18} />, roles: ["ADMIN", "SALES"] },
  { label: "Sales Orders", href: "/sales", icon: <TrendingUp size={18} />, roles: ["ADMIN", "SALES", "ACCOUNTS"] },
  { label: "Delivery Orders", href: "/delivery", icon: <Truck size={18} />, roles: ["ADMIN", "WAREHOUSE", "SALES"] },
  { label: "Invoices", href: "/invoices", icon: <Receipt size={18} />, roles: ["ADMIN", "ACCOUNTS"] },
  { label: "Party Ledger", href: "/ledger", icon: <BookOpen size={18} />, roles: ["ADMIN", "ACCOUNTS"] },
  { label: "Reports", href: "/reports", icon: <BarChart3 size={18} /> },
  {
    label: "Master Data",
    icon: <Package size={18} />,
    children: [
      { label: "Products", href: "/masters/products", icon: <Zap size={16} /> },
      { label: "Suppliers", href: "/masters/suppliers", icon: <Building2 size={16} /> },
      { label: "Customers", href: "/masters/customers", icon: <Users size={16} /> },
      { label: "Warehouses", href: "/masters/warehouses", icon: <Warehouse size={16} /> },
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

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [expandedGroups, setExpandedGroups] = useState<string[]>(["Master Data", "Settings"])

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
    return pathname.startsWith(href)
  }

  const canView = (item: NavItem) => {
    if (!item.roles || !user) return true
    return item.roles.includes(user.role)
  }

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: "#1e2533" }}>
      {/* Logo */}
      <div className="px-6 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-yellow-400 rounded-lg flex items-center justify-center flex-shrink-0">
            <Zap size={18} className="text-gray-900" />
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-tight">Garibsons</p>
            <p className="text-blue-300 text-xs">Solar ERP</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-1">
        {navItems.map((item) => {
          if (!canView(item)) return null

          if (item.children) {
            const isExpanded = expandedGroups.includes(item.label)
            const hasActiveChild = item.children.some((c) => c.href && isActive(c.href))

            return (
              <div key={item.label}>
                <button
                  onClick={() => toggleGroup(item.label)}
                  className={clsx(
                    "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                    hasActiveChild
                      ? "text-white bg-white/10"
                      : "text-gray-400 hover:text-white hover:bg-white/5"
                  )}
                >
                  <div className="flex items-center gap-3">
                    {item.icon}
                    {item.label}
                  </div>
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                {isExpanded && (
                  <div className="mt-1 ml-3 space-y-1">
                    {item.children.map((child) => (
                      <Link
                        key={child.href}
                        href={child.href!}
                        className={clsx(
                          "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                          isActive(child.href!)
                            ? "bg-blue-600 text-white font-medium"
                            : "text-gray-400 hover:text-white hover:bg-white/5"
                        )}
                      >
                        {child.icon}
                        {child.label}
                      </Link>
                    ))}
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
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                isActive(item.href!)
                  ? "bg-blue-600 text-white"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              )}
            >
              {item.icon}
              {item.label}
            </Link>
          )
        })}
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
