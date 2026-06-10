/** Shared query-param parsing for report endpoints. */
export interface ReportFilters {
  from: Date | null
  to: Date | null
  customerId: string | null
  brand: string | null
  bankId: string | null
  supplierId: string | null
  warehouseId: string | null
  status: string | null
}

export function parseFilters(request: Request): ReportFilters {
  const sp = new URL(request.url).searchParams
  const d = (v: string | null) => (v ? new Date(v) : null)
  const to = d(sp.get("to"))
  if (to) to.setHours(23, 59, 59, 999) // inclusive end-of-day
  return {
    from: d(sp.get("from")),
    to,
    customerId: sp.get("customerId") || null,
    brand: sp.get("brand") || null,
    bankId: sp.get("bankId") || null,
    supplierId: sp.get("supplierId") || null,
    warehouseId: sp.get("warehouseId") || null,
    status: sp.get("status") || null,
  }
}

/** Build a Prisma date-range filter for a given field. */
export function dateRange(f: ReportFilters): { gte?: Date; lte?: Date } | undefined {
  if (!f.from && !f.to) return undefined
  return { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) }
}

export const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
