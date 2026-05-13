import { prisma } from "@/lib/prisma"
import { summarizeStockEntries, summarizeStockEntry } from "@/lib/stock"

export async function GET() {
  try {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    // Run all independent queries in parallel
    const [
      stockEntries,
      todayOrders,
      invoiceTotals,
      paymentTotals,
      activePOs,
      recentSOs,
      openDeliveryOrders,
    ] = await Promise.all([
      prisma.stockEntry.findMany({
        include: {
          movements: { select: { type: true, quantity: true } },
          warehouse: { select: { id: true, name: true } },
          po: { select: { gstInputAmount: true, noOfPanels: true } },
        },
      }),
      prisma.salesOrder.aggregate({
        where: { createdAt: { gte: todayStart } },
        _sum: { grandTotal: true },
        _count: true,
      }),
      prisma.invoice.aggregate({
        where: { status: { in: ["UNPAID", "PARTIAL"] } },
        _sum: { grandTotal: true },
      }),
      prisma.payment.aggregate({
        where: { invoice: { status: { in: ["UNPAID", "PARTIAL"] } } },
        _sum: { amount: true },
      }),
      prisma.purchaseOrder.count({
        where: { status: { in: ["DRAFT", "CONFIRMED", "SHIPPED", "CLEARED"] } },
      }),
      prisma.salesOrder.findMany({
        take: 10,
        select: {
          id: true,
          soNumber: true,
          grandTotal: true,
          status: true,
          createdAt: true,
          customer: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.deliveryOrder.findMany({
        where: { status: { in: ["PENDING", "AUTHORIZED"] } },
        select: { createdAt: true },
      }),
    ])

    const stockTotals = summarizeStockEntries(stockEntries)

    const totalGstInStock = stockEntries.reduce((sum, entry) => {
      const summary = summarizeStockEntry(entry)
      const gstPerPanel =
        entry.po?.gstInputAmount && entry.po.noOfPanels > 0
          ? entry.po.gstInputAmount / entry.po.noOfPanels
          : 0
      return sum + gstPerPanel * summary.currentQuantity
    }, 0)

    const totalReceivables = (invoiceTotals._sum.grandTotal ?? 0) - (paymentTotals._sum.amount ?? 0)

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
        totalGstInStock,
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
