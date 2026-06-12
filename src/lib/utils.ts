export function formatCurrency(amount: number): string {
  return `Rs ${amount.toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

export function formatNumber(n: number, decimals = 2): string {
  return n.toLocaleString("en-PK", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" })
}

/**
 * Subtle status-tinted row styling (background + left accent border) used via
 * Table's rowClassName so row state is readable at a glance. Colours mirror
 * the Badge palette.
 */
const STATUS_ROW_CLASSES: Record<string, string> = {
  // Generic
  DRAFT: "bg-gray-50 border-l-4 border-l-gray-300",
  PENDING: "bg-yellow-50 border-l-4 border-l-yellow-400",
  CONFIRMED: "bg-green-50 border-l-4 border-l-green-400",
  CANCELLED: "bg-red-50 border-l-4 border-l-red-300 opacity-70",
  ACTIVE: "bg-green-50 border-l-4 border-l-green-400",
  INACTIVE: "bg-gray-50 border-l-4 border-l-gray-300 opacity-70",

  // Purchase orders
  SHIPPED: "bg-blue-50 border-l-4 border-l-blue-400",
  CLEARED: "bg-purple-50 border-l-4 border-l-purple-400",
  RECEIVED: "bg-green-50 border-l-4 border-l-green-400",
  READY_TO_RECEIVE: "bg-teal-50 border-l-4 border-l-teal-400",
  FINALIZED: "bg-green-50 border-l-4 border-l-green-400",

  // Sales orders
  PENDING_PAYMENT: "bg-orange-50 border-l-4 border-l-orange-400",
  PAYMENT_CONFIRMED: "bg-teal-50 border-l-4 border-l-teal-400",
  DO_ISSUED: "bg-blue-50 border-l-4 border-l-blue-400",
  DELIVERED: "bg-indigo-50 border-l-4 border-l-indigo-400",
  INVOICED: "bg-green-50 border-l-4 border-l-green-400",

  // Delivery
  AUTHORIZED: "bg-blue-50 border-l-4 border-l-blue-400",
  DISPATCHED: "bg-green-50 border-l-4 border-l-green-400",

  // Invoice
  UNPAID: "bg-red-50 border-l-4 border-l-red-300",
  PARTIAL: "bg-orange-50 border-l-4 border-l-orange-400",
  PARTIALLY_PAID: "bg-orange-50 border-l-4 border-l-orange-400",
  PAID: "bg-green-50 border-l-4 border-l-green-400",

  // Quotation
  SENT: "bg-blue-50 border-l-4 border-l-blue-400",
  ACCEPTED: "bg-green-50 border-l-4 border-l-green-400",
  REJECTED: "bg-red-50 border-l-4 border-l-red-300",
}

export function statusRowClass(status?: string | null): string {
  if (!status) return ""
  return STATUS_ROW_CLASSES[status] || ""
}
