"use client"

import { clsx } from "clsx"

interface BadgeProps {
  status: string
  className?: string
}

/* Soft 100-level background + 800-level text — the GS Energy badge map.
   One hue per semantic meaning, flat (no ring). */
const tones = {
  neutral: "bg-slate-100 text-slate-700 dark:bg-slate-400/10 dark:text-slate-300",
  info: "bg-blue-100 text-blue-800 dark:bg-blue-500/10 dark:text-blue-300",
  progress: "bg-indigo-100 text-indigo-800 dark:bg-indigo-500/10 dark:text-indigo-300",
  warning: "bg-amber-100 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300",
  success: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300",
  danger: "bg-rose-100 text-rose-800 dark:bg-rose-500/10 dark:text-rose-300",
  special: "bg-violet-100 text-violet-800 dark:bg-violet-500/10 dark:text-violet-300",
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
  // Humanise enums (PENDING_PAYMENT → "pending payment"); `capitalize` then Title-Cases.
  const label = status.replace(/_/g, " ").toLowerCase()

  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium capitalize transition-colors duration-300",
        colorClass,
        className
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
      {label}
    </span>
  )
}
