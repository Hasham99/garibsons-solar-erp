import { prisma } from "@/lib/prisma"

export async function GET() {
  try {
    const pos = await prisma.purchaseOrder.findMany({
      include: {
        product: { select: { name: true, code: true, wattage: true } },
        supplier: { select: { name: true } },
        stockEntries: { select: { panelQuantity: true } },
      },
      orderBy: { createdAt: "desc" },
    })

    const rows = pos.map((po) => {
      const receivedPanels = po.stockEntries.reduce((s, e) => s + e.panelQuantity, 0)
      return {
        id: po.id,
        poNumber: po.poNumber,
        product: po.product?.name ?? "—",
        supplier: po.supplier?.name ?? "—",
        noOfPanels: po.noOfPanels,
        panelWattage: po.panelWattage,
        totalWatts: po.totalWatts,
        totalValueUsd: po.totalValueUsd,
        poAmountPkr: po.poAmountPkr,
        totalLandedCost: po.totalLandedCost,
        landedCostPerPanel: po.landedCostPerPanel,
        status: po.status,
        lcType: po.lcType,
        noOfContainers: po.noOfContainers,
        receivedPanels,
        pendingPanels: Math.max(0, po.noOfPanels - receivedPanels),
        createdAt: po.createdAt,
      }
    })

    const byStatus = rows.reduce((acc, row) => {
      acc[row.status] = (acc[row.status] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    return Response.json({ rows, byStatus })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to fetch PO status report" }, { status: 500 })
  }
}
