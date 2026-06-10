import { prisma } from "@/lib/prisma"
import { parseFilters, dateRange, monthKey } from "@/lib/report-filters"

export async function GET(request: Request) {
  try {
    const f = parseFilters(request)
    const pos = await prisma.purchaseOrder.findMany({
      where: {
        ...(f.supplierId ? { supplierId: f.supplierId } : {}),
        ...(f.status ? { lcType: f.status as never } : {}),
        ...(dateRange(f) ? { createdAt: dateRange(f) } : {}),
      },
      include: { supplier: { select: { name: true } }, product: { select: { name: true, brand: true } } },
      orderBy: { createdAt: "desc" },
    })

    const bySupplier = new Map<string, { supplier: string; panels: number; value: number; orders: number }>()
    const byMonth = new Map<string, { month: string; value: number; panels: number }>()
    for (const p of pos) {
      const sn = p.supplier?.name || "—"
      const s = bySupplier.get(sn) || { supplier: sn, panels: 0, value: 0, orders: 0 }
      s.panels += p.noOfPanels; s.value += p.poAmountPkr; s.orders++; bySupplier.set(sn, s)
      const mk = monthKey(p.createdAt)
      const m = byMonth.get(mk) || { month: mk, value: 0, panels: 0 }
      m.value += p.poAmountPkr; m.panels += p.noOfPanels; byMonth.set(mk, m)
    }

    const rows = pos.map((p) => ({
      id: p.id, poNumber: p.poNumber, date: p.createdAt, supplier: p.supplier?.name || "—",
      product: p.product?.name || "—", lcType: p.lcType, lcNumber: p.lcNumber,
      panels: p.noOfPanels, watts: p.totalWatts, value: p.poAmountPkr, status: p.status,
    }))

    return Response.json({
      rows,
      summary: { orders: pos.length, panels: pos.reduce((s, p) => s + p.noOfPanels, 0), value: pos.reduce((s, p) => s + p.poAmountPkr, 0) },
      bySupplier: [...bySupplier.values()].sort((a, b) => b.value - a.value),
      byMonth: [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)),
    })
  } catch (e) {
    console.error(e)
    return Response.json({ error: "Failed to build purchases report" }, { status: 500 })
  }
}
