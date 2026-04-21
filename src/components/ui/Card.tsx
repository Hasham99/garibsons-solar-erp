"use client"

import { ReactNode } from "react"
import { clsx } from "clsx"

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon?: ReactNode
  trend?: { value: number; label: string }
  color?: "blue" | "green" | "yellow" | "red" | "purple"
}

export function StatCard({ title, value, subtitle, icon, color = "blue" }: StatCardProps) {
  const colorClasses = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-green-50 text-green-600",
    yellow: "bg-yellow-50 text-yellow-600",
    red: "bg-red-50 text-red-600",
    purple: "bg-purple-50 text-purple-600",
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="mt-2 text-2xl font-bold text-gray-900 leading-tight wrap-break-word">{value}</p>
          {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
        </div>
        {icon && (
          <div className={clsx("p-3 rounded-xl", colorClasses[color])}>
            {icon}
          </div>
        )}
      </div>
    </div>
  )
}

interface CardProps {
  title?: string
  children: ReactNode
  className?: string
  actions?: ReactNode
}

export function Card({ title, children, className, actions }: CardProps) {
  return (
    <div className={clsx("bg-white rounded-xl shadow-sm border border-gray-200", className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          {title && <h3 className="font-semibold text-gray-900">{title}</h3>}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="p-6">{children}</div>
    </div>
  )
}
