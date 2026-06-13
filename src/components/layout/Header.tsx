"use client"

import { ReactNode } from "react"

interface BreadcrumbItem {
  label: string
  href?: string
}

interface HeaderProps {
  title: string
  /** @deprecated Breadcrumbs now render automatically in the TopBar — this prop is ignored. */
  breadcrumbs?: BreadcrumbItem[]
  actions?: ReactNode
}

export function Header({ title, actions }: HeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <h1 className="text-xl font-bold tracking-tight text-slate-900">{title}</h1>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  )
}
