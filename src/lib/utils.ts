export function formatCurrency(amount: number): string {
  return `Rs ${amount.toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

export function formatNumber(n: number, decimals = 2): string {
  return n.toLocaleString("en-PK", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" })
}
