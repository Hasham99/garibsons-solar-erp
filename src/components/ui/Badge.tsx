"use client"

import { clsx } from "clsx"

interface BadgeProps {
  status: string
  className?: string
}

/* Calm, ring-bordered tones — one hue per semantic meaning */
const tones = {
  neutral: "bg-slate-50 text-slate-600 ring-slate-500/15",
  info: "bg-blue-50 text-blue-700 ring-blue-600/15",
  progress: "bg-indigo-50 text-indigo-700 ring-indigo-600/15",
  warning: "bg-amber-50 text-amber-700 ring-amber-600/20",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
  danger: "bg-rose-50 text-rose-700 ring-rose-600/15",
  special: "bg-violet-50 text-violet-700 ring-violet-600/15",
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
