"use client"

import { clsx } from "clsx"

interface BadgeProps {
  status: string
  className?: string
}

const statusColors: Record<string, string> = {
  // Generic
  DRAFT: "bg-gray-100 text-gray-700",
  PENDING: "bg-yellow-100 text-yellow-800",
  CONFIRMED: "bg-green-100 text-green-800",
  CANCELLED: "bg-red-100 text-red-800",
  ACTIVE: "bg-green-100 text-green-800",
  INACTIVE: "bg-gray-100 text-gray-700",

  // Purchase Orders
  SHIPPED: "bg-blue-100 text-blue-800",
  CLEARED: "bg-purple-100 text-purple-800",
  RECEIVED: "bg-green-100 text-green-800",

  // Sales Orders
  PENDING_PAYMENT: "bg-orange-100 text-orange-800",
  PAYMENT_CONFIRMED: "bg-teal-100 text-teal-800",
  DO_ISSUED: "bg-blue-100 text-blue-800",
  DELIVERED: "bg-indigo-100 text-indigo-800",
  INVOICED: "bg-green-100 text-green-800",

  // Delivery
  AUTHORIZED: "bg-blue-100 text-blue-800",
  DISPATCHED: "bg-green-100 text-green-800",

  // Invoice
  UNPAID: "bg-red-100 text-red-800",
  PARTIAL: "bg-orange-100 text-orange-800",
  PAID: "bg-green-100 text-green-800",

  // Quotation
  SENT: "bg-blue-100 text-blue-800",
  ACCEPTED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",

  // Costing
  FINALIZED: "bg-green-100 text-green-800",
}

export function Badge({ status, className }: BadgeProps) {
  const colorClass = statusColors[status] || "bg-gray-100 text-gray-700"
  const label = status.replace(/_/g, " ")

  return (
    <span
      className={clsx(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
        colorClass,
        className
      )}
    >
      {label}
    </span>
  )
}
