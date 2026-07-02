import { prisma } from "@/lib/prisma"
import { parseFilters, dateRange } from "@/lib/report-filters"

/** Gross profit by product = delivered sales revenue − FIFO landed cost (the
 *  STOCK_OUT movements × each batch's costPerPanel). */
export async function GET(request: Request) {
  try {
    const f = parseFilters(request)
    const sos = await prisma.salesOrder.findMany({
      where: { status: "DELIVERED", ...(dateRange(f) ? { orderDate: dateRange(f) } : {}) },
      select: { id: true, lines: { select: { productId: true, quantity: true, totalAmount: true } } },
    })
    const soIds = sos.map((s) => s.id)
    const movements = soIds.length
      ? await prisma.stockMovement.findMany({
          where: { type: "STOCK_OUT", soId: { in: soIds } },
          select: { quantity: true, stockEntry: { select: { costPerPanel: true, productId: true, product: { select: { name: true, brand: true } } } } },
        })
      : []

    type Agg = { product: string; brand: string; panels: number; revenue: number; cogs: number }
    const byProduct = new Map<string, Agg>()
    const get = (pid: string, name = "—", brand = "—") => {
      let a = byProduct.get(pid)
      if (!a) { a = { product: name, brand, panels: 0, revenue: 0, cogs: 0 }; byProduct.set(pid, a) }
      return a
    }
    for (const s of sos) for (const l of s.lines) get(l.productId).revenue += l.totalAmount
    for (const m of movements) {
      const e = m.stockEntry
      if (!e) continue
      const a = get(e.productId, e.product?.name, e.product?.brand)
      a.panels += m.quantity
      a.cogs += m.quantity * e.costPerPanel
    }

    // Net out completed sales returns for these SOs: they reduce delivered units,
    // COGS (goods went back to the original cost layer) and revenue (the credit note).
    const returnLines = soIds.length
      ? await prisma.salesReturnLine.findMany({
          where: { salesReturn: { status: "COMPLETED", soId: { in: soIds } } },
          select: { productId: true, quantity: true, amount: true, stockEntry: { select: { costPerPanel: true } } },
        })
      : []
    for (const r of returnLines) {
      const a = get(r.productId)
      a.panels -= r.quantity
      a.revenue -= r.amount
      a.cogs -= r.quantity * (r.stockEntry?.costPerPanel ?? 0)
    }

    // Resolve product name/brand by id directly. The revenue loop above seeds
    // each entry with placeholder "—", and only rows that also had a stock
    // movement got their real name backfilled — so look every product up here
    // to guarantee the name/brand columns are populated.
    const productIds = [...byProduct.keys()]
    const products = productIds.length
      ? await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true, brand: true } })
      : []
    const productMap = new Map(products.map((p) => [p.id, p]))

    let rows = [...byProduct.entries()].map(([pid, a]) => {
      const p = productMap.get(pid)
      return {
        ...a,
        product: p?.name ?? a.product,
        brand: p?.brand ?? a.brand,
        grossProfit: a.revenue - a.cogs,
        marginPct: a.revenue > 0 ? ((a.revenue - a.cogs) / a.revenue) * 100 : 0,
      }
    })
    if (f.brand) rows = rows.filter((r) => r.brand === f.brand)
    rows.sort((a, b) => b.grossProfit - a.grossProfit)

    // Operating expenses + inventory adjustments over the same window → Net Profit.
    const range = dateRange(f)
    const [expenseAgg, adjMovements, foundEntries] = await Promise.all([
      prisma.expense.aggregate({ _sum: { amount: true }, where: range ? { date: range } : {} }),
      prisma.stockMovement.findMany({
        where: { type: "ADJUSTMENT", returnId: null, quantity: { lt: 0 }, ...(range ? { createdAt: range } : {}) },
        select: { quantity: true, unitCost: true, stockEntry: { select: { costPerPanel: true } } },
      }),
      prisma.stockEntry.findMany({
        where: { origin: "ADJUSTMENT", ...(range ? { createdAt: range } : {}) },
        select: { totalValue: true },
      }),
    ])
    const operatingExpenses = expenseAgg._sum.amount || 0
    const writeOffLoss = adjMovements.reduce((s, m) => s + Math.abs(m.quantity) * (m.unitCost ?? m.stockEntry?.costPerPanel ?? 0), 0)
    const foundGain = foundEntries.reduce((s, e) => s + e.totalValue, 0)

    const grossProfit = rows.reduce((s, r) => s + r.grossProfit, 0)
    const netProfit = grossProfit + foundGain - writeOffLoss - operatingExpenses
    const summary = {
      revenue: rows.reduce((s, r) => s + r.revenue, 0),
      cogs: rows.reduce((s, r) => s + r.cogs, 0),
      grossProfit,
      operatingExpenses,
      writeOffLoss,
      foundGain,
      netProfit,
    }
    return Response.json({ rows, summary: { ...summary, marginPct: summary.revenue > 0 ? (summary.grossProfit / summary.revenue) * 100 : 0 } })
  } catch (e) {
    console.error(e)
    return Response.json({ error: "Failed to build profitability report" }, { status: 500 })
  }
}
