"use client"

import { ReactNode } from "react"
import Link from "next/link"
import { ChevronRight } from "lucide-react"

interface BreadcrumbItem {
  label: string
  href?: string
}

interface HeaderProps {
  title: string
  breadcrumbs?: BreadcrumbItem[]
  actions?: ReactNode
}

export function Header({ title, breadcrumbs, actions }: HeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav className="flex items-center gap-1 text-sm text-gray-500 mb-1">
            {breadcrumbs.map((crumb, idx) => (
              <div key={idx} className="flex items-center gap-1">
                {idx > 0 && <ChevronRight size={14} />}
                {crumb.href ? (
                  <Link href={crumb.href} className="hover:text-gray-900 transition-colors">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="text-gray-900">{crumb.label}</span>
                )}
              </div>
            ))}
          </nav>
        )}
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  )
}
