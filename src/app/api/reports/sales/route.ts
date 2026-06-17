import { prisma } from "@/lib/prisma"
import { parseFilters, dateRange, monthKey } from "@/lib/report-filters"

export async function GET(request: Request) {
  try {
    const f = parseFilters(request)
    const orders = await prisma.salesOrder.findMany({
      where: {
        status: f.status ? { equals: f.status as never } : { not: "CANCELLED" },
        ...(f.customerId ? { customerId: f.customerId } : {}),
        ...(dateRange(f) ? { orderDate: dateRange(f) } : {}),
      },
      include: { customer: { select: { name: true } }, lines: { include: { product: { select: { name: true, brand: true } } } } },
      orderBy: { orderDate: "desc" },
    })

    // Per-order paid amount: collections (customer-level) are applied to that
    // customer's orders oldest-first — the same FIFO basis as the aging report.
    const custIds = [...new Set(orders.map((o) => o.customerId))]
    const custs = custIds.length
      ? await prisma.customer.findMany({
          where: { id: { in: custIds } },
          select: {
            id: true,
            salesOrders: { where: { status: { not: "CANCELLED" } }, select: { id: true, grandTotal: true }, orderBy: { orderDate: "asc" } },
            receipts: { select: { amount: true } },
          },
        })
      : []
    const paidBySo = new Map<string, number>()
    for (const c of custs) {
      let applied = c.receipts.reduce((s, r) => s + r.amount, 0)
      for (const o of c.salesOrders) {
        const paid = Math.min(o.grandTotal, applied)
        applied -= paid
        paidBySo.set(o.id, paid)
      }
    }

    const byCustomer = new Map<string, { customer: string; value: number; panels: number; orders: number }>()
    const byBrand = new Map<string, { brand: string; value: number; panels: number }>()
    const byMonth = new Map<string, { month: string; value: number; panels: number; orders: number }>()

    const rows = orders
      .map((o) => {
        const lines = f.brand ? o.lines.filter((l) => l.product?.brand === f.brand) : o.lines
        if (f.brand && lines.length === 0) return null
        const panels = lines.reduce((s, l) => s + l.quantity, 0)
        const watts = lines.reduce((s, l) => s + l.watts, 0)
        const value = f.brand ? lines.reduce((s, l) => s + l.totalAmount, 0) : o.grandTotal
        const items = lines.map((l) => `${l.product?.name} ×${l.quantity}`).join(", ")
        const brand = [...new Set(lines.map((l) => l.product?.brand).filter(Boolean))].join(", ") || "—"
        // Collected / balance reflect the whole order (grand total basis).
        const collected = paidBySo.get(o.id) ?? 0
        const balance = Math.max(0, o.grandTotal - collected)

        const c = byCustomer.get(o.customerId) || { customer: o.customer?.name || "—", value: 0, panels: 0, orders: 0 }
        c.value += value; c.panels += panels; c.orders += 1; byCustomer.set(o.customerId, c)
        for (const l of lines) {
          const b = byBrand.get(l.product?.brand || "—") || { brand: l.product?.brand || "—", value: 0, panels: 0 }
          b.value += l.totalAmount; b.panels += l.quantity; byBrand.set(l.product?.brand || "—", b)
        }
        const mk = monthKey(o.orderDate)
        const m = byMonth.get(mk) || { month: mk, value: 0, panels: 0, orders: 0 }
        m.value += value; m.panels += panels; m.orders += 1; byMonth.set(mk, m)

        return { id: o.id, soNumber: o.soNumber, date: o.orderDate, customer: o.customer?.name || "—", status: o.status, brand, items, panels, watts, value, collected, balance }
      })
      .filter(Boolean) as { id: string; soNumber: string; date: Date; customer: string; status: string; brand: string; items: string; panels: number; watts: number; value: number; collected: number; balance: number }[]

    const summary = {
      orders: rows.length,
      value: rows.reduce((s, r) => s + r.value, 0),
      panels: rows.reduce((s, r) => s + r.panels, 0),
      watts: rows.reduce((s, r) => s + r.watts, 0),
      collected: rows.reduce((s, r) => s + r.collected, 0),
      balance: rows.reduce((s, r) => s + r.balance, 0),
      delivered: orders.filter((o) => o.status === "DELIVERED").length,
      pending: orders.filter((o) => o.status === "PAYMENT_CONFIRMED").length,
    }

    return Response.json({
      rows,
      summary,
      byCustomer: [...byCustomer.values()].sort((a, b) => b.value - a.value),
      byBrand: [...byBrand.values()].sort((a, b) => b.value - a.value),
      byMonth: [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)),
    })
  } catch (e) {
    console.error(e)
    return Response.json({ error: "Failed to build sales report" }, { status: 500 })
  }
}
