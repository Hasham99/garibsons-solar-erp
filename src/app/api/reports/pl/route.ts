import { prisma } from "@/lib/prisma"

export async function GET() {
  try {
    const pos = await prisma.purchaseOrder.findMany({
      include: {
        product: true,
        supplier: true,
        stockEntries: {
          include: {
            movements: {
              where: { type: "STOCK_OUT" },
              include: {
                salesOrder: {
                  include: {
                    invoices: true,
                    lines: true,
                  },
                },
              },
            },
          },
        },
      },
      where: {
        status: { in: ["RECEIVED", "CLEARED"] },
      },
      orderBy: { createdAt: "desc" },
    })

    // Also get all invoices to calculate per-LC revenue
    const allInvoices = await prisma.invoice.findMany({
      where: { status: { not: "CANCELLED" } },
      include: {
        salesOrder: {
          include: {
            lines: true,
          },
        },
      },
    })

    // Build a map of SO → invoice revenue
    const soRevenue: Record<string, number> = {}
    for (const inv of allInvoices) {
      const key = inv.soId
      soRevenue[key] = (soRevenue[key] || 0) + inv.subTotal // exclude GST for revenue
    }

    // Completed returns net out against the PO whose cost layer the goods went back to.
    const returnLines = await prisma.salesReturnLine.findMany({
      where: { salesReturn: { status: "COMPLETED" } },
      select: { quantity: true, amount: true, stockEntry: { select: { poId: true } } },
    })
    const returnedQtyByPo: Record<string, number> = {}
    const returnCreditByPo: Record<string, number> = {}
    for (const r of returnLines) {
      const poId = r.stockEntry?.poId
      if (!poId) continue
      returnedQtyByPo[poId] = (returnedQtyByPo[poId] || 0) + r.quantity
      returnCreditByPo[poId] = (returnCreditByPo[poId] || 0) + r.amount
    }

    const plData = pos.map((po) => {
      const landedCostPerPanel = po.landedCostPerPanel || (po.totalLandedCost ? po.totalLandedCost / po.noOfPanels : po.poAmountPkr / po.noOfPanels)
      const totalLandedCost = po.totalLandedCost || po.poAmountPkr

      // Count panels sold from STOCK_OUT movements linked to this PO's stock entries
      let panelsSold = 0
      const linkedSOIds = new Set<string>()

      for (const entry of po.stockEntries) {
        for (const movement of entry.movements) {
          panelsSold += movement.quantity
          if (movement.soId) linkedSOIds.add(movement.soId)
        }
      }

      // Net out returned panels (goods came back to this PO's cost layers).
      panelsSold = Math.max(0, panelsSold - (returnedQtyByPo[po.id] || 0))

      // Revenue from invoices linked to these SOs, less any return credit notes.
      let salesRevenue = 0
      for (const soId of linkedSOIds) {
        salesRevenue += soRevenue[soId] || 0
      }
      salesRevenue = Math.max(0, salesRevenue - (returnCreditByPo[po.id] || 0))

      const costOfSales = panelsSold * landedCostPerPanel
      const grossProfit = salesRevenue - costOfSales
      const grossMarginPct = salesRevenue > 0 ? (grossProfit / salesRevenue) * 100 : 0
      const panelsRemaining = po.noOfPanels - panelsSold
      const inventoryValue = panelsRemaining * landedCostPerPanel

      return {
        id: po.id,
        poNumber: po.poNumber,
        product: po.product.name,
        supplier: po.supplier.name,
        totalPanels: po.noOfPanels,
        panelsSold,
        panelsRemaining,
        landedCostPerPanel,
        totalLandedCost,
        costOfSales,
        salesRevenue,
        grossProfit,
        grossMarginPct,
        inventoryValue,
        status: po.status,
      }
    })

    // Aggregate totals
    const totals = {
      panelsSold: plData.reduce((s, r) => s + r.panelsSold, 0),
      salesRevenue: plData.reduce((s, r) => s + r.salesRevenue, 0),
      costOfSales: plData.reduce((s, r) => s + r.costOfSales, 0),
      grossProfit: plData.reduce((s, r) => s + r.grossProfit, 0),
      inventoryValue: plData.reduce((s, r) => s + r.inventoryValue, 0),
    }
    const totalMargin = totals.salesRevenue > 0
      ? (totals.grossProfit / totals.salesRevenue) * 100
      : 0

    return Response.json({ rows: plData, totals: { ...totals, grossMarginPct: totalMargin } })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to generate P&L report" }, { status: 500 })
  }
}
