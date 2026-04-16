import { prisma } from "@/lib/prisma"
import { summarizeStockEntries, summarizeStockEntry } from "@/lib/stock"

export async function GET() {
  try {
    const stockEntries = await prisma.stockEntry.findMany({
      include: {
        movements: { select: { type: true, quantity: true } },
        warehouse: true,
      },
    })

    const stockTotals = summarizeStockEntries(stockEntries)

    // Today's sales
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayOrders = await prisma.salesOrder.aggregate({
      where: { createdAt: { gte: todayStart } },
      _sum: { grandTotal: true },
      _count: true,
    })

    // Outstanding receivables
    const unpaidInvoices = await prisma.invoice.findMany({
      where: { status: { in: ["UNPAID", "PARTIAL"] } },
      include: { payments: true },
    })
    const totalReceivables = unpaidInvoices.reduce((s, inv) => {
      const paid = inv.payments.reduce((ps, p) => ps + p.amount, 0)
      return s + (inv.grandTotal - paid)
    }, 0)

    // Active POs
    const activePOs = await prisma.purchaseOrder.count({
      where: { status: { in: ["DRAFT", "CONFIRMED", "SHIPPED", "CLEARED"] } },
    })

    // Recent sales orders
    const recentSOs = await prisma.salesOrder.findMany({
      take: 10,
      include: { customer: true },
      orderBy: { createdAt: "desc" },
    })

    const openDeliveryOrders = await prisma.deliveryOrder.findMany({
      where: {
        status: { in: ["PENDING", "AUTHORIZED"] },
      },
      select: { createdAt: true },
    })

    const warehouseStock: Record<string, { name: string; availablePanels: number; reservedPanels: number; value: number }> = {}
    for (const entry of stockEntries) {
      const summary = summarizeStockEntry(entry)
      const wId = entry.warehouseId
      if (!warehouseStock[wId]) {
        warehouseStock[wId] = { name: entry.warehouse.name, availablePanels: 0, reservedPanels: 0, value: 0 }
      }
      warehouseStock[wId].availablePanels += summary.availableQuantity
      warehouseStock[wId].reservedPanels += summary.reservedQuantity
      warehouseStock[wId].value += summary.currentValue
    }

    return Response.json({
      summary: {
        totalPanels: stockTotals.currentPanels,
        availablePanels: stockTotals.availablePanels,
        reservedPanels: stockTotals.reservedPanels,
        totalStockValue: stockTotals.currentValue,
        availableStockValue: stockTotals.availableValue,
        reservedStockValue: stockTotals.reservedValue,
        todaySales: todayOrders._sum.grandTotal || 0,
        todaySalesCount: todayOrders._count,
        totalReceivables,
        activePOs,
        openDeliveryOrders: openDeliveryOrders.length,
        agingDeliveryOrders: openDeliveryOrders.filter((order) => {
          const ageInDays = Math.floor((Date.now() - order.createdAt.getTime()) / (1000 * 60 * 60 * 24))
          return ageInDays >= 2
        }).length,
      },
      recentOrders: recentSOs,
      warehouseStock: Object.values(warehouseStock),
    })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to fetch dashboard data" }, { status: 500 })
  }
}
