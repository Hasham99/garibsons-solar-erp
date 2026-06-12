"use client"

import { ReactNode } from "react"
import { clsx } from "clsx"
import { TrendingUp, TrendingDown } from "lucide-react"

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon?: ReactNode
  trend?: { value: number; label: string }
  color?: "blue" | "green" | "yellow" | "red" | "purple" | "indigo" | "emerald" | "amber" | "rose" | "pink" | "orange" | "teal" | "violet"
}

export function StatCard({ title, value, subtitle, icon, trend, color = "blue" }: StatCardProps) {
  const colorClasses = {
    blue: "bg-gradient-to-br from-blue-500 to-blue-600 shadow-blue-200",
    green: "bg-gradient-to-br from-green-500 to-green-600 shadow-green-200",
    yellow: "bg-gradient-to-br from-yellow-400 to-amber-500 shadow-amber-200",
    red: "bg-gradient-to-br from-red-500 to-rose-600 shadow-rose-200",
    purple: "bg-gradient-to-br from-purple-500 to-purple-600 shadow-purple-200",
    indigo: "bg-gradient-to-br from-indigo-500 to-indigo-600 shadow-indigo-200",
    emerald: "bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-emerald-200",
    amber: "bg-gradient-to-br from-amber-400 to-orange-500 shadow-amber-200",
    rose: "bg-gradient-to-br from-rose-500 to-rose-600 shadow-rose-200",
    pink: "bg-gradient-to-br from-pink-500 to-pink-600 shadow-pink-200",
    orange: "bg-gradient-to-br from-orange-400 to-orange-600 shadow-orange-200",
    teal: "bg-gradient-to-br from-teal-500 to-teal-600 shadow-teal-200",
    violet: "bg-gradient-to-br from-violet-500 to-violet-600 shadow-violet-200",
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 min-w-0 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-slate-500 truncate" title={title}>{title}</p>
          <p className="mt-2 text-xl xl:text-2xl font-bold text-slate-900 leading-tight wrap-break-word tabular-nums">{value}</p>
          {subtitle && <p className="mt-1 text-[13px] text-slate-500 truncate" title={subtitle}>{subtitle}</p>}
          {trend && (
            <p
              className={clsx(
                "mt-1.5 inline-flex items-center gap-1 text-xs font-medium rounded-full px-2 py-0.5",
                trend.value >= 0 ? "text-emerald-700 bg-emerald-50" : "text-rose-700 bg-rose-50"
              )}
            >
              {trend.value >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {Math.abs(trend.value).toFixed(0)}% {trend.label}
            </p>
          )}
        </div>
        {icon && (
          <div className={clsx("p-3 rounded-xl shrink-0 text-white shadow-lg", colorClasses[color])}>
            {icon}
          </div>
        )}
      </div>
    </div>
  )
}

interface CardProps {
  title?: string
  subtitle?: string
  children: ReactNode
  className?: string
  actions?: ReactNode
}

export function Card({ title, subtitle, children, className, actions }: CardProps) {
  return (
    <div className={clsx("bg-white rounded-xl shadow-sm border border-slate-200", className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            {title && <h3 className="font-semibold text-slate-900">{title}</h3>}
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="p-6">{children}</div>
    </div>
  )
}
