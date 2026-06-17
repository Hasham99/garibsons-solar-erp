import { prisma } from "@/lib/prisma"
import { parseFilters, dateRange, monthKey } from "@/lib/report-filters"
import { liftedPanels, computePallets } from "@/lib/delivery"
import { getOutstandingReservations } from "@/lib/stock"

/** Delivery Orders report — dispatch activity with lifted vs. still-reserved
 *  (balance) panels, derived from stock movements like the rest of the app. */
export async function GET(request: Request) {
  try {
    const f = parseFilters(request)
    const dos = await prisma.deliveryOrder.findMany({
      where: {
        ...(f.status ? { status: f.status } : {}),
        ...(f.warehouseId ? { warehouseId: f.warehouseId } : {}),
        ...(f.customerId ? { salesOrder: { customerId: f.customerId } } : {}),
        ...(dateRange(f) ? { createdAt: dateRange(f) } : {}),
      },
      include: {
        salesOrder: { select: { soNumber: true, customer: { select: { name: true } } } },
        warehouse: { select: { name: true } },
        lines: {
          select: {
            quantity: true,
            watts: true,
            product: { select: { name: true, brand: true, panelsPerContainer: true, palletsPerContainer: true } },
          },
        },
        stockMovements: { select: { type: true, quantity: true, watts: true, stockEntryId: true } },
      },
      orderBy: { createdAt: "desc" },
    })

    const byCustomer = new Map<string, { customer: string; dos: number; panels: number; lifted: number }>()
    const byWarehouse = new Map<string, { warehouse: string; dos: number; panels: number; lifted: number }>()
    const byMonth = new Map<string, { month: string; dos: number; panels: number; lifted: number }>()
    const byStatus = new Map<string, number>()

    const rows = dos.map((d) => {
      const lifted = liftedPanels(d.stockMovements)
      const balance = getOutstandingReservations(d.stockMovements).reduce((s, r) => s + r.quantity, 0)
      const pallets = d.lines.reduce((s, l) => s + computePallets(l.quantity, l.product), 0)
      const items = d.lines.map((l) => `${l.product?.name} ×${l.quantity}`).join(", ")
      const brand = [...new Set(d.lines.map((l) => l.product?.brand).filter(Boolean))].join(", ") || "—"
      const customer = d.salesOrder?.customer?.name || "—"
      const warehouse = d.warehouse?.name || "—"

      const c = byCustomer.get(customer) || { customer, dos: 0, panels: 0, lifted: 0 }
      c.dos += 1; c.panels += d.quantity; c.lifted += lifted; byCustomer.set(customer, c)
      const w = byWarehouse.get(warehouse) || { warehouse, dos: 0, panels: 0, lifted: 0 }
      w.dos += 1; w.panels += d.quantity; w.lifted += lifted; byWarehouse.set(warehouse, w)
      const mk = monthKey(d.createdAt)
      const m = byMonth.get(mk) || { month: mk, dos: 0, panels: 0, lifted: 0 }
      m.dos += 1; m.panels += d.quantity; m.lifted += lifted; byMonth.set(mk, m)
      byStatus.set(d.status, (byStatus.get(d.status) || 0) + 1)

      return {
        id: d.id,
        doNumber: d.doNumber,
        referenceNo: d.referenceNo,
        date: d.createdAt,
        customer,
        soNumber: d.salesOrder?.soNumber || "—",
        warehouse,
        status: d.status,
        brand,
        items,
        panels: d.quantity,
        watts: d.watts,
        lifted,
        balance,
        pallets,
      }
    })

    const summary = {
      dos: rows.length,
      panels: rows.reduce((s, r) => s + r.panels, 0),
      watts: rows.reduce((s, r) => s + r.watts, 0),
      lifted: rows.reduce((s, r) => s + r.lifted, 0),
      balance: rows.reduce((s, r) => s + r.balance, 0),
      pallets: rows.reduce((s, r) => s + r.pallets, 0),
      dispatched: rows.filter((r) => r.status === "DISPATCHED").length,
      pending: rows.filter((r) => r.status === "PENDING" || r.status === "AUTHORIZED").length,
    }

    return Response.json({
      rows,
      summary,
      byStatus: Object.fromEntries(byStatus),
      byCustomer: [...byCustomer.values()].sort((a, b) => b.panels - a.panels),
      byWarehouse: [...byWarehouse.values()].sort((a, b) => b.panels - a.panels),
      byMonth: [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)),
    })
  } catch (e) {
    console.error(e)
    return Response.json({ error: "Failed to build deliveries report" }, { status: 500 })
  }
}
