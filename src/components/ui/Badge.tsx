"use client"

import { clsx } from "clsx"

interface BadgeProps {
  status: string
  className?: string
}

/* Calm, ring-bordered tones — one hue per semantic meaning */
const tones = {
  neutral: "bg-slate-50 text-slate-600 ring-slate-500/15 dark:bg-slate-400/10 dark:text-slate-300 dark:ring-slate-400/20",
  info: "bg-blue-50 text-blue-700 ring-blue-600/15 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/25",
  progress: "bg-indigo-50 text-indigo-700 ring-indigo-600/15 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-500/25",
  warning: "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/25",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/25",
  danger: "bg-rose-50 text-rose-700 ring-rose-600/15 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/25",
  special: "bg-violet-50 text-violet-700 ring-violet-600/15 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-500/25",
}

const statusColors: Record<string, string> = {
  // Generic
  DRAFT: tones.neutral,
  PENDING: tones.warning,
  CONFIRMED: tones.success,
  CANCELLED: tones.danger,
  ACTIVE: tones.success,
  INACTIVE: tones.neutral,

  // Purchase Orders
  SHIPPED: tones.info,
  CLEARED: tones.special,
  RECEIVED: tones.success,

  // Sales Orders
  PENDING_PAYMENT: tones.warning,
  PAYMENT_CONFIRMED: tones.progress,
  DO_ISSUED: tones.info,
  DELIVERED: tones.progress,
  INVOICED: tones.success,

  // Delivery
  AUTHORIZED: tones.info,
  PARTIALLY_DISPATCHED: tones.warning,
  DISPATCHED: tones.success,

  // Invoice
  UNPAID: tones.danger,
  PARTIAL: tones.warning,
  PAID: tones.success,

  // Quotation
  SENT: tones.info,
  ACCEPTED: tones.success,
  REJECTED: tones.danger,

  // Costing
  FINALIZED: tones.success,
}

export function Badge({ status, className }: BadgeProps) {
  const colorClass = statusColors[status] || tones.neutral
  const label = status.replace(/_/g, " ")

  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset transition-colors duration-300",
        colorClass,
        className
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
      {label}
    </span>
  )
}
