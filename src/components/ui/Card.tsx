"use client"

import { ReactNode } from "react"
import { clsx } from "clsx"
import { TrendingUp, TrendingDown } from "lucide-react"
import { AnimatedNumber } from "@/components/motion/Motion"

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon?: ReactNode
  trend?: { value: number; label: string }
  /** Tiny inline trend line rendered along the card's bottom (e.g. last 6 months). */
  spark?: number[]
  color?: "blue" | "green" | "yellow" | "red" | "purple" | "indigo" | "emerald" | "amber" | "rose" | "pink" | "orange" | "teal" | "violet"
}

function Sparkline({ data }: { data: number[] }) {
  const max = Math.max(...data)
  const min = Math.min(...data)
  const span = max - min || 1
  const points = data
    .map((v, i) => `${(i / (data.length - 1)) * 100},${27 - ((v - min) / span) * 24}`)
    .join(" ")
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-8 w-full" aria-hidden>
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

export function StatCard({ title, value, subtitle, icon, trend, spark, color = "blue" }: StatCardProps) {
  /* Sparkline stroke per accent color */
  const sparkColors = {
    blue: "text-blue-400",
    green: "text-emerald-400",
    yellow: "text-amber-400",
    red: "text-rose-400",
    purple: "text-purple-400",
    indigo: "text-indigo-400",
    emerald: "text-emerald-400",
    amber: "text-amber-400",
    rose: "text-rose-400",
    pink: "text-pink-400",
    orange: "text-orange-400",
    teal: "text-teal-400",
    violet: "text-violet-400",
  }

  /* Soft tinted chips — calmer than saturated gradient blocks */
  const colorClasses = {
    blue: "bg-blue-50 text-blue-600 ring-blue-100 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/20",
    green: "bg-emerald-50 text-emerald-600 ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20",
    yellow: "bg-amber-50 text-amber-600 ring-amber-100 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/20",
    red: "bg-rose-50 text-rose-600 ring-rose-100 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/20",
    purple: "bg-purple-50 text-purple-600 ring-purple-100 dark:bg-purple-500/10 dark:text-purple-300 dark:ring-purple-500/20",
    indigo: "bg-indigo-50 text-indigo-600 ring-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-500/20",
    emerald: "bg-emerald-50 text-emerald-600 ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20",
    amber: "bg-amber-50 text-amber-600 ring-amber-100 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/20",
    rose: "bg-rose-50 text-rose-600 ring-rose-100 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/20",
    pink: "bg-pink-50 text-pink-600 ring-pink-100 dark:bg-pink-500/10 dark:text-pink-300 dark:ring-pink-500/20",
    orange: "bg-orange-50 text-orange-600 ring-orange-100 dark:bg-orange-500/10 dark:text-orange-300 dark:ring-orange-500/20",
    teal: "bg-teal-50 text-teal-600 ring-teal-100 dark:bg-teal-500/10 dark:text-teal-300 dark:ring-teal-500/20",
    violet: "bg-violet-50 text-violet-600 ring-violet-100 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-500/20",
  }

  return (
    <div className="h-full bg-surface rounded-xl shadow-card border border-line p-5 min-w-0 transition-all duration-300 hover:shadow-card-hover hover:-translate-y-0.5 hover:border-line-strong">
      {/* Title + icon share the top row; the value gets the full card width below
          so long amounts (e.g. "Rs 2,529,875,502") stay on one line. */}
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-secondary truncate" title={title}>{title}</p>
        {icon && (
          <div className={clsx("-mt-1 p-3 rounded-xl shrink-0 ring-1 ring-inset", colorClasses[color])}>
            {icon}
          </div>
        )}
      </div>
      <p className="mt-2 text-lg xl:text-xl font-bold text-foreground leading-tight whitespace-nowrap tabular-nums">
        <AnimatedNumber value={value} />
      </p>
      {subtitle && <p className="mt-1 text-[13px] text-secondary truncate" title={subtitle}>{subtitle}</p>}
      {trend && (
        <p
          className={clsx(
            "mt-1.5 inline-flex items-center gap-1 text-xs font-medium rounded-full px-2 py-0.5",
            trend.value >= 0 ? "text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-500/10" : "text-rose-700 bg-rose-50 dark:text-rose-300 dark:bg-rose-500/10"
          )}
        >
          {trend.value >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          {Math.abs(trend.value).toFixed(0)}% {trend.label}
        </p>
      )}
      {spark && spark.length > 1 && (
        <div className={clsx("mt-3 -mb-1 opacity-50", sparkColors[color])}>
          <Sparkline data={spark} />
        </div>
      )}
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
    <div className={clsx("bg-surface rounded-xl shadow-card border border-line", className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-line">
          <div>
            {title && <h3 className="font-semibold text-foreground">{title}</h3>}
            {subtitle && <p className="text-xs text-secondary mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  )
}
