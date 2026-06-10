import { prisma } from "@/lib/prisma"
import { parseFilters } from "@/lib/report-filters"

const BUCKETS = ["current", "1to30", "31to60", "61to90", "over90"] as const
type Bucket = (typeof BUCKETS)[number]
function bucketFor(days: number): Bucket {
  if (days <= 0) return "current"
  if (days <= 30) return "1to30"
  if (days <= 60) return "31to60"
  if (days <= 90) return "61to90"
  return "over90"
}

/** Customer outstanding = Σ SO − Σ collections, with FIFO aging (collections
 *  applied to oldest sales orders first). Accurate for the SO/collection model. */
export async function GET(request: Request) {
  try {
    const f = parseFilters(request)
    const now = Date.now()
    const where = f.customerId ? { id: f.customerId } : {}
    const customers = await prisma.customer.findMany({
      where,
      select: {
        id: true, name: true,
        salesOrders: { where: { status: { not: "CANCELLED" } }, select: { orderDate: true, grandTotal: true }, orderBy: { orderDate: "asc" } },
        receipts: { select: { amount: true } },
      },
    })

    const summary: Record<Bucket, number> = { current: 0, "1to30": 0, "31to60": 0, "61to90": 0, over90: 0 }
    const rows = customers
      .map((c) => {
        const soTotal = c.salesOrders.reduce((s, o) => s + o.grandTotal, 0)
        const collected = c.receipts.reduce((s, r) => s + r.amount, 0)
        const outstanding = soTotal - collected
        let applied = collected
        let oldestUnpaid: Date | null = null
        const buckets: Record<Bucket, number> = { current: 0, "1to30": 0, "31to60": 0, "61to90": 0, over90: 0 }
        for (const o of c.salesOrders) {
          const unpaid = Math.max(0, o.grandTotal - applied)
          applied = Math.max(0, applied - o.grandTotal)
          if (unpaid > 0) {
            if (!oldestUnpaid) oldestUnpaid = o.orderDate
            const days = Math.floor((now - o.orderDate.getTime()) / 86400000)
            buckets[bucketFor(days)] += unpaid
          }
        }
        if (outstanding > 0) for (const b of BUCKETS) summary[b] += buckets[b]
        return { customerId: c.id, customer: c.name, soTotal, collected, outstanding, oldestUnpaid, buckets }
      })
      .filter((r) => Math.abs(r.outstanding) > 0.5)
      .sort((a, b) => b.outstanding - a.outstanding)

    const totalOutstanding = rows.reduce((s, r) => s + (r.outstanding > 0 ? r.outstanding : 0), 0)
    const totalAdvance = rows.reduce((s, r) => s + (r.outstanding < 0 ? -r.outstanding : 0), 0)
    return Response.json({ rows, summary, totalOutstanding, totalAdvance })
  } catch (e) {
    console.error(e)
    return Response.json({ error: "Failed to build outstanding report" }, { status: 500 })
  }
}
