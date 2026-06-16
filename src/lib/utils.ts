export function formatCurrency(amount: number): string {
  return `Rs ${amount.toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

export function formatNumber(n: number, decimals = 2): string {
  return n.toLocaleString("en-PK", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

/**
 * Money value WITHOUT the "Rs" prefix — for table columns whose header already
 * states the currency (e.g. "Grand Total (PKR)"), so the symbol isn't repeated
 * on every row. Use formatCurrency for standalone values (cards, detail panels).
 */
export function formatAmount(amount: number): string {
  return amount.toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
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
  DRAFT: "bg-slate-50/70 dark:bg-slate-400/10 border-l-4 border-l-slate-300 dark:border-l-slate-500",
  PENDING: "bg-amber-50/60 dark:bg-amber-500/10 border-l-4 border-l-amber-400",
  CONFIRMED: "bg-emerald-50/60 dark:bg-emerald-500/10 border-l-4 border-l-emerald-400",
  CANCELLED: "bg-rose-50/60 dark:bg-rose-500/10 border-l-4 border-l-rose-300 dark:border-l-rose-500 opacity-70",
  ACTIVE: "bg-emerald-50/60 dark:bg-emerald-500/10 border-l-4 border-l-emerald-400",
  INACTIVE: "bg-slate-50/70 dark:bg-slate-400/10 border-l-4 border-l-slate-300 dark:border-l-slate-500 opacity-70",

  // Purchase orders
  SHIPPED: "bg-blue-50/60 dark:bg-blue-500/10 border-l-4 border-l-blue-400",
  CLEARED: "bg-violet-50/60 dark:bg-violet-500/10 border-l-4 border-l-violet-400",
  RECEIVED: "bg-emerald-50/60 dark:bg-emerald-500/10 border-l-4 border-l-emerald-400",
  READY_TO_RECEIVE: "bg-teal-50/60 dark:bg-teal-500/10 border-l-4 border-l-teal-400",
  FINALIZED: "bg-emerald-50/60 dark:bg-emerald-500/10 border-l-4 border-l-emerald-400",

  // Sales orders
  PENDING_PAYMENT: "bg-amber-50/60 dark:bg-amber-500/10 border-l-4 border-l-amber-400",
  PAYMENT_CONFIRMED: "bg-teal-50/60 dark:bg-teal-500/10 border-l-4 border-l-teal-400",
  DO_ISSUED: "bg-blue-50/60 dark:bg-blue-500/10 border-l-4 border-l-blue-400",
  DELIVERED: "bg-indigo-50/60 dark:bg-indigo-500/10 border-l-4 border-l-indigo-400",
  INVOICED: "bg-emerald-50/60 dark:bg-emerald-500/10 border-l-4 border-l-emerald-400",

  // Delivery
  AUTHORIZED: "bg-blue-50/60 dark:bg-blue-500/10 border-l-4 border-l-blue-400",
  PARTIALLY_DISPATCHED: "bg-amber-50/60 dark:bg-amber-500/10 border-l-4 border-l-amber-400",
  DISPATCHED: "bg-emerald-50/60 dark:bg-emerald-500/10 border-l-4 border-l-emerald-400",

  // Invoice
  UNPAID: "bg-rose-50/60 dark:bg-rose-500/10 border-l-4 border-l-rose-300 dark:border-l-rose-500",
  PARTIAL: "bg-amber-50/60 dark:bg-amber-500/10 border-l-4 border-l-amber-400",
  PARTIALLY_PAID: "bg-amber-50/60 dark:bg-amber-500/10 border-l-4 border-l-amber-400",
  PAID: "bg-emerald-50/60 dark:bg-emerald-500/10 border-l-4 border-l-emerald-400",

  // Quotation
  SENT: "bg-blue-50/60 dark:bg-blue-500/10 border-l-4 border-l-blue-400",
  ACCEPTED: "bg-emerald-50/60 dark:bg-emerald-500/10 border-l-4 border-l-emerald-400",
  REJECTED: "bg-rose-50/60 dark:bg-rose-500/10 border-l-4 border-l-rose-300 dark:border-l-rose-500",
}

export function statusRowClass(status?: string | null): string {
  if (!status) return ""
  return STATUS_ROW_CLASSES[status] || ""
}
