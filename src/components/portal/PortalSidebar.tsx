"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { clsx } from "clsx"
import { SIDEBAR_SURFACE } from "@/lib/surfaces"
import { portalNav, isPortalActive } from "@/components/portal/portalNav"

interface PortalSidebarProps {
  collapsed: boolean
  onToggle: () => void
}

export function PortalSidebar({ collapsed, onToggle }: PortalSidebarProps) {
  const pathname = usePathname()

  return (
    <div className="relative flex h-full flex-col border-r border-white/5" style={SIDEBAR_SURFACE}>
      {/* Logo */}
      <div className={clsx("flex items-center border-b border-white/10", collapsed ? "justify-center px-2 py-4" : "px-5 py-4")}>
        {collapsed ? (
          <div className="h-9 w-9 shrink-0 rounded-xl bg-white p-1 shadow-lg shadow-black/30 flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/garibsons-logo.png" alt="Garibsons" className="h-full w-full object-contain" />
          </div>
        ) : (
          <div className="min-w-0 animate-fade-in leading-none">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/gbs-logo-inverted.png" alt="Garibsons (Pvt) Ltd" className="h-4 w-auto object-contain" />
            <p className="mt-2 text-[10px] font-semibold tracking-[0.18em] text-[#f6a040]">CUSTOMER PORTAL</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className={clsx("sidebar-scroll flex-1 overflow-y-auto overflow-x-hidden py-4", collapsed ? "px-2.5" : "px-3")}>
        {portalNav.map((section) => (
          <div key={section.label} className="mb-4 last:mb-0">
            {collapsed ? (
              <div className="mx-2 mb-2 border-t border-white/10" />
            ) : (
              <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{section.label}</p>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active = isPortalActive(item.href, pathname, item.exact)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    onClick={(e) => {
                      if (collapsed && active) {
                        e.preventDefault()
                        onToggle()
                      }
                    }}
                    className={clsx(
                      "group relative flex items-center rounded-lg text-sm font-medium transition-all duration-200",
                      collapsed ? "justify-center px-0 py-2" : "gap-3 px-3 py-1.5",
                      active ? "bg-blue-600 text-white" : "text-slate-400 hover:bg-white/5 hover:text-white"
                    )}
                  >
                    {active && !collapsed && (
                      <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-white/80 animate-scale-in" />
                    )}
                    <span className={clsx("shrink-0 transition-all duration-200", !active && "group-hover:scale-110")}>{item.icon}</span>
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>
    </div>
  )
}
