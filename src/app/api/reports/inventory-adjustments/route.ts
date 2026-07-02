import { prisma } from "@/lib/prisma"
import { parseFilters, dateRange } from "@/lib/report-filters"

/**
 * Inventory adjustments (manual stock write-offs & found-stock gains) with their
 * cost impact. Excludes return-driven ADJUSTMENT movements (returnId != null) —
 * those are handled by the sales-return credit-note flow.
 */
export async function GET(request: Request) {
  try {
    const f = parseFilters(request)
    const range = dateRange(f)

    // Losses — negative ADJUSTMENT movements (not from a return).
    const decreases = await prisma.stockMovement.findMany({
      where: {
        type: "ADJUSTMENT",
        returnId: null,
        quantity: { lt: 0 },
        ...(range ? { createdAt: range } : {}),
      },
      include: {
        user: { select: { name: true } },
        stockEntry: {
          select: {
            costPerPanel: true,
            warehouseId: true,
            product: { select: { name: true, brand: true } },
            warehouse: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    // Gains — found-stock cost layers.
    const increases = await prisma.stockEntry.findMany({
      where: {
        origin: "ADJUSTMENT",
        ...(range ? { createdAt: range } : {}),
        ...(f.warehouseId ? { warehouseId: f.warehouseId } : {}),
      },
      include: {
        product: { select: { name: true, brand: true } },
        warehouse: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    })

    type Row = {
      id: string
      date: string
      type: "DECREASE" | "INCREASE"
      category: string | null
      product: string
      brand: string
      warehouse: string
      quantity: number
      unitCost: number
      value: number
      reason: string | null
      user: string | null
    }

    const rows: Row[] = []

    for (const m of decreases) {
      if (f.brand && m.stockEntry?.product?.brand !== f.brand) continue
      if (f.warehouseId && m.stockEntry?.warehouseId !== f.warehouseId) continue
      const unitCost = m.unitCost ?? m.stockEntry?.costPerPanel ?? 0
      const qty = Math.abs(m.quantity)
      rows.push({
        id: m.id,
        date: m.createdAt.toISOString(),
        type: "DECREASE",
        category: m.category,
        product: m.stockEntry?.product?.name ?? "—",
        brand: m.stockEntry?.product?.brand ?? "—",
        warehouse: m.stockEntry?.warehouse?.name ?? "—",
        quantity: qty,
        unitCost,
        value: -(qty * unitCost),
        reason: m.reason,
        user: m.user?.name ?? m.approvedBy ?? null,
      })
    }

    for (const e of increases) {
      if (f.brand && e.product?.brand !== f.brand) continue
      rows.push({
        id: e.id,
        date: e.createdAt.toISOString(),
        type: "INCREASE",
        category: e.adjustmentCategory,
        product: e.product?.name ?? "—",
        brand: e.product?.brand ?? "—",
        warehouse: e.warehouse?.name ?? "—",
        quantity: e.panelQuantity,
        unitCost: e.costPerPanel,
        value: e.totalValue,
        reason: e.adjustmentReason,
        user: null,
      })
    }

    rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    const writeOffLoss = rows.filter((r) => r.type === "DECREASE").reduce((s, r) => s + Math.abs(r.value), 0)
    const foundGain = rows.filter((r) => r.type === "INCREASE").reduce((s, r) => s + r.value, 0)

    return Response.json({
      rows,
      summary: { writeOffLoss, foundGain, net: foundGain - writeOffLoss, count: rows.length },
    })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to build inventory adjustments report" }, { status: 500 })
  }
}
