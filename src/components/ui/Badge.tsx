"use client"

import { clsx } from "clsx"

interface BadgeProps {
  status: string
  className?: string
}

/* Soft 100-level background + 800-level text — the GS Energy badge map.
   One hue per semantic meaning, flat (no ring). */
const tones = {
  neutral: "bg-slate-100 text-slate-700",
  info: "bg-blue-100 text-blue-800",
  progress: "bg-indigo-100 text-indigo-800",
  warning: "bg-amber-100 text-amber-800",
  success: "bg-emerald-100 text-emerald-800",
  danger: "bg-rose-100 text-rose-800",
  special: "bg-violet-100 text-violet-800",
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
