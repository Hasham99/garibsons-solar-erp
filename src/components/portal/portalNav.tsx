import { LayoutDashboard, Upload, ReceiptText, BookOpen, TrendingUp, Truck, Receipt, UserRound } from "lucide-react"
import type { ReactNode } from "react"

export interface PortalNavItem {
  label: string
  href: string
  icon: ReactNode
  /** Match the path exactly (used for the dashboard root). */
  exact?: boolean
}

export interface PortalNavSection {
  label: string
  items: PortalNavItem[]
}

/** Single source of truth for portal navigation — shared by the sidebar,
 *  top-bar breadcrumb and search. */
export const portalNav: PortalNavSection[] = [
  {
    label: "Overview",
    items: [{ label: "Dashboard", href: "/portal", icon: <LayoutDashboard size={18} />, exact: true }],
  },
  {
    label: "Payments",
    items: [
      { label: "Upload Slip", href: "/portal/upload", icon: <Upload size={18} /> },
      { label: "My Slips", href: "/portal/slips", icon: <ReceiptText size={18} /> },
    ],
  },
  {
    label: "Account",
    items: [
      { label: "Ledger", href: "/portal/ledger", icon: <BookOpen size={18} /> },
      { label: "Sales Orders", href: "/portal/orders", icon: <TrendingUp size={18} /> },
      { label: "Deliveries", href: "/portal/deliveries", icon: <Truck size={18} /> },
      { label: "Invoices", href: "/portal/invoices", icon: <Receipt size={18} /> },
      { label: "My Profile", href: "/portal/profile", icon: <UserRound size={18} /> },
    ],
  },
]

export const portalNavItems: PortalNavItem[] = portalNav.flatMap((s) => s.items)

/** Returns whether a nav href is active for the given pathname. */
export function isPortalActive(href: string, pathname: string, exact?: boolean) {
  if (exact) return pathname === href
  return pathname === href || pathname.startsWith(href + "/")
}

/** Best breadcrumb trail (section + item label) for the current path. */
export function portalTrail(pathname: string): string[] {
  for (const section of portalNav) {
    // longest match wins so /portal doesn't shadow /portal/upload
    const match = [...section.items]
      .sort((a, b) => b.href.length - a.href.length)
      .find((it) => isPortalActive(it.href, pathname, it.exact))
    if (match) return [section.label, match.label]
  }
  return []
}
