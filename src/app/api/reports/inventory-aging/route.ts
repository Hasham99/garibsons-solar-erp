import { prisma } from "@/lib/prisma"
import { summarizeStockEntry } from "@/lib/stock"
import { parseFilters, dateRange } from "@/lib/report-filters"

type AgeBucket = "0to30" | "31to60" | "61to90" | "over90"
const ageBucket = (d: number): AgeBucket => (d <= 30 ? "0to30" : d <= 60 ? "31to60" : d <= 90 ? "61to90" : "over90")

/** Stock aging — available panels by how long they've been in stock. */
export async function GET(request: Request) {
  try {
    const f = parseFilters(request)
    const entries = await prisma.stockEntry.findMany({
      where: {
        ...(f.warehouseId ? { warehouseId: f.warehouseId } : {}),
        ...(f.brand ? { product: { brand: f.brand } } : {}),
        ...(dateRange(f) ? { receivedAt: dateRange(f) } : {}),
      },
      include: {
        product: { select: { name: true, code: true, brand: true } },
        warehouse: { select: { name: true } },
        movements: { select: { type: true, quantity: true, watts: true, stockEntryId: true } },
      },
      orderBy: { receivedAt: "asc" },
    })

    const summary: Record<AgeBucket, { panels: number; value: number }> = {
      "0to30": { panels: 0, value: 0 }, "31to60": { panels: 0, value: 0 }, "61to90": { panels: 0, value: 0 }, over90: { panels: 0, value: 0 },
    }
    const rows = entries
      .map((e) => {
        const s = summarizeStockEntry(e)
        if (s.availableQuantity <= 0) return null
        const bucket = ageBucket(s.agingDays)
        const value = s.availableQuantity * e.costPerPanel
        summary[bucket].panels += s.availableQuantity
        summary[bucket].value += value
        return {
          id: e.id, product: e.product?.name || "—", code: e.product?.code || "—", brand: e.product?.brand || "—",
          warehouse: e.warehouse?.name || "—", availablePanels: s.availableQuantity, ageDays: s.agingDays,
          bucket, costPerPanel: e.costPerPanel, value, receivedAt: e.receivedAt,
        }
      })
      .filter(Boolean)
      .sort((a, b) => (b as { ageDays: number }).ageDays - (a as { ageDays: number }).ageDays)

    return Response.json({ rows, summary })
  } catch (e) {
    console.error(e)
    return Response.json({ error: "Failed to build inventory aging report" }, { status: 500 })
  }
}
