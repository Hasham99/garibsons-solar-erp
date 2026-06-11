import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth"

/**
 * Stock Position report — mirrors the admin's manual sheet:
 *   per product: received (local / import) → SO (ordered) → DO issued →
 *   lifted / unlifted → warehouse stock → balance SO → available for sale,
 * plus a FIFO-based PKR valuation of remaining stock.
 *
 * Definitions (panels):
 *   receivedLocal/Import  Σ STOCK_IN (split by PO lcType; opening counts as import)
 *   so                    Σ SO line qty (status ≠ CANCELLED)
 *   doIssued              Σ DO qty (status ≠ CANCELLED)
 *   lifted                Σ STOCK_OUT (physically dispatched)
 *   unlifted              doIssued − lifted
 *   warehouseStock        received + adjustments − lifted
 *   balanceSO             so − doIssued (deals not yet on DO)
 *   availableForSale      warehouseStock − unlifted − balanceSO
 *   value (FIFO)          Σ per-batch remaining panels × batch cost
 */
export async function GET() {
  try {
    const session = await getSession()
    if (!session.isLoggedIn) return Response.json({ error: "Unauthorized" }, { status: 401 })

    const [products, entries, soLines, doLines] = await Promise.all([
      prisma.product.findMany({
        select: { id: true, name: true, wattage: true, panelsPerContainer: true, palletsPerContainer: true },
      }),
      prisma.stockEntry.findMany({
        select: {
          productId: true,
          panelQuantity: true,
          costPerWatt: true,
          wattQuantity: true,
          po: { select: { lcType: true } },
          movements: { select: { type: true, quantity: true } },
        },
      }),
      prisma.salesOrderLine.groupBy({
        by: ["productId"],
        where: { salesOrder: { status: { not: "CANCELLED" } } },
        _sum: { quantity: true },
      }),
      prisma.deliveryOrderLine.groupBy({
        by: ["productId"],
        where: { deliveryOrder: { status: { not: "CANCELLED" } } },
        _sum: { quantity: true },
      }),
    ])

    const soMap = new Map(soLines.map((l) => [l.productId, l._sum.quantity ?? 0]))
    const doMap = new Map(doLines.map((l) => [l.productId, l._sum.quantity ?? 0]))

    type Acc = {
      receivedLocal: number
      receivedImport: number
      lifted: number
      adjustments: number
      remainingValue: number
      remainingWatts: number
    }
    const acc = new Map<string, Acc>()
    for (const e of entries) {
      const a = acc.get(e.productId) ?? { receivedLocal: 0, receivedImport: 0, lifted: 0, adjustments: 0, remainingValue: 0, remainingWatts: 0 }
      const stockIn = e.movements.filter((m) => m.type === "STOCK_IN").reduce((s, m) => s + m.quantity, 0)
      const stockOut = e.movements.filter((m) => m.type === "STOCK_OUT").reduce((s, m) => s + m.quantity, 0)
      const adj = e.movements.filter((m) => m.type === "ADJUSTMENT").reduce((s, m) => s + m.quantity, 0)
      if (e.po?.lcType === "LOCAL") a.receivedLocal += stockIn
      else a.receivedImport += stockIn
      a.lifted += stockOut
      a.adjustments += adj
      // FIFO remaining value: what's left in THIS batch at THIS batch's cost.
      const remaining = Math.max(0, e.panelQuantity + adj - stockOut)
      const wattsPerPanel = e.panelQuantity > 0 ? e.wattQuantity / e.panelQuantity : 0
      a.remainingWatts += remaining * wattsPerPanel
      a.remainingValue += remaining * wattsPerPanel * e.costPerWatt
      acc.set(e.productId, a)
    }

    const rows = products
      .map((p) => {
        const a = acc.get(p.id) ?? { receivedLocal: 0, receivedImport: 0, lifted: 0, adjustments: 0, remainingValue: 0, remainingWatts: 0 }
        const so = soMap.get(p.id) ?? 0
        const doIssued = doMap.get(p.id) ?? 0
        const received = a.receivedLocal + a.receivedImport
        const warehouseStock = received + a.adjustments - a.lifted
        const unlifted = Math.max(0, doIssued - a.lifted)
        const balanceSO = Math.max(0, so - doIssued)
        const availableForSale = warehouseStock - unlifted - balanceSO
        const panelsPerPallet =
          p.panelsPerContainer && p.palletsPerContainer && p.palletsPerContainer > 0
            ? p.panelsPerContainer / p.palletsPerContainer
            : p.panelsPerContainer
        const fifoRate = a.remainingWatts > 0 ? a.remainingValue / a.remainingWatts : 0
        return {
          productId: p.id,
          item: p.name,
          wattage: p.wattage,
          packing: panelsPerPallet ? Math.round(panelsPerPallet) : null,
          panelsPerContainer: p.panelsPerContainer,
          receivedLocal: a.receivedLocal,
          receivedImport: a.receivedImport,
          so,
          availableForSale,
          doIssued,
          lifted: a.lifted,
          unlifted,
          warehouseStock,
          balanceSO,
          stockWatts: Math.round(warehouseStock * p.wattage),
          fifoRatePerWatt: Math.round(fifoRate * 100) / 100,
          stockValue: Math.round(a.remainingValue),
        }
      })
      .filter((r) => r.receivedLocal || r.receivedImport || r.so || r.doIssued || r.warehouseStock)
      .sort((x, y) => x.item.localeCompare(y.item))

    const totals = rows.reduce(
      (t, r) => ({
        receivedLocal: t.receivedLocal + r.receivedLocal,
        receivedImport: t.receivedImport + r.receivedImport,
        so: t.so + r.so,
        availableForSale: t.availableForSale + r.availableForSale,
        doIssued: t.doIssued + r.doIssued,
        lifted: t.lifted + r.lifted,
        unlifted: t.unlifted + r.unlifted,
        warehouseStock: t.warehouseStock + r.warehouseStock,
        balanceSO: t.balanceSO + r.balanceSO,
        stockWatts: t.stockWatts + r.stockWatts,
        stockValue: t.stockValue + r.stockValue,
      }),
      { receivedLocal: 0, receivedImport: 0, so: 0, availableForSale: 0, doIssued: 0, lifted: 0, unlifted: 0, warehouseStock: 0, balanceSO: 0, stockWatts: 0, stockValue: 0 }
    )

    return Response.json({ rows, totals, asOf: new Date().toISOString() })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to build stock position report" }, { status: 500 })
  }
}
