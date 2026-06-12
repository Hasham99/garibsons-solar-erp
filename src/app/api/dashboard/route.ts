import { prisma } from "@/lib/prisma"
import { summarizeStockEntries, summarizeStockEntry } from "@/lib/stock"

const ACTIVE_PO_STATUSES = ["DRAFT", "CONFIRMED", "SHIPPED", "CLEARED"]

export async function GET() {
  try {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1)
    // First day of the month 5 months back — gives a rolling 6-month trend window
    const trendStart = new Date(todayStart.getFullYear(), todayStart.getMonth() - 5, 1)

    // Run all independent queries in parallel
    const [
      stockEntries,
      todayOrders,
      monthOrders,
      soTotals,
      receiptTotals,
      monthReceipts,
      todayReceipts,
      monthExpenses,
      poGroups,
      activePOAgg,
      soStatusGroups,
      recentSOs,
      recentReceipts,
      openDeliveryOrders,
      trendSOs,
      trendReceipts,
      customerSoSums,
      customerReceiptSums,
      customers,
    ] = await Promise.all([
      prisma.stockEntry.findMany({
        include: {
          movements: { select: { type: true, quantity: true } },
          warehouse: { select: { id: true, name: true } },
          po: { select: { gstInputAmount: true, noOfPanels: true } },
          product: { select: { id: true, name: true, code: true, wattage: true, lowStockThreshold: true } },
        },
      }),
      prisma.salesOrder.aggregate({
        where: { createdAt: { gte: todayStart }, status: { not: "CANCELLED" } },
        _sum: { grandTotal: true },
        _count: true,
      }),
      prisma.salesOrder.aggregate({
        where: { orderDate: { gte: monthStart }, status: { not: "CANCELLED" } },
        _sum: { grandTotal: true },
        _count: true,
      }),
      prisma.salesOrder.aggregate({
        where: { status: { not: "CANCELLED" } },
        _sum: { grandTotal: true },
      }),
      prisma.customerReceipt.aggregate({ _sum: { amount: true } }),
      prisma.customerReceipt.aggregate({
        where: { valueDate: { gte: monthStart } },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.customerReceipt.aggregate({
        where: { valueDate: { gte: todayStart } },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.expense.aggregate({
        where: { date: { gte: monthStart } },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.purchaseOrder.groupBy({
        by: ["status"],
        _count: true,
        _sum: { noOfPanels: true, poAmountPkr: true },
      }),
      prisma.purchaseOrder.aggregate({
        where: { status: { in: ACTIVE_PO_STATUSES } },
        _sum: { noOfPanels: true, poAmountPkr: true },
        _count: true,
      }),
      prisma.salesOrder.groupBy({
        by: ["status"],
        _count: true,
        where: { status: { not: "CANCELLED" } },
      }),
      prisma.salesOrder.findMany({
        take: 8,
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
      prisma.customerReceipt.findMany({
        take: 8,
        select: {
          id: true,
          receiptNo: true,
          amount: true,
          valueDate: true,
          customer: { select: { name: true } },
          bank: { select: { name: true } },
        },
        orderBy: { valueDate: "desc" },
      }),
      prisma.deliveryOrder.findMany({
        where: { status: { in: ["PENDING", "AUTHORIZED"] } },
        select: { createdAt: true },
      }),
      prisma.salesOrder.findMany({
        where: { orderDate: { gte: trendStart }, status: { not: "CANCELLED" } },
        select: { orderDate: true, grandTotal: true },
      }),
      prisma.customerReceipt.findMany({
        where: { valueDate: { gte: trendStart } },
        select: { valueDate: true, amount: true },
      }),
      prisma.salesOrder.groupBy({
        by: ["customerId"],
        where: { status: { not: "CANCELLED" } },
        _sum: { grandTotal: true },
      }),
      prisma.customerReceipt.groupBy({
        by: ["customerId"],
        _sum: { amount: true },
      }),
      prisma.customer.findMany({ select: { id: true, name: true } }),
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

    // Receivables follow the ledger model: Σ sales orders − Σ collections
    const totalReceivables = (soTotals._sum.grandTotal ?? 0) - (receiptTotals._sum.amount ?? 0)

    // Per-warehouse stock breakdown + per-product availability (for low-stock alerts)
    const warehouseStock: Record<string, { name: string; availablePanels: number; reservedPanels: number; value: number }> = {}
    const productStock: Record<string, { name: string; code: string; wattage: number; threshold: number; available: number }> = {}
    for (const entry of stockEntries) {
      const summary = summarizeStockEntry(entry)
      const wId = entry.warehouseId
      if (!warehouseStock[wId]) {
        warehouseStock[wId] = { name: entry.warehouse.name, availablePanels: 0, reservedPanels: 0, value: 0 }
      }
      warehouseStock[wId].availablePanels += summary.availableQuantity
      warehouseStock[wId].reservedPanels += summary.reservedQuantity
      warehouseStock[wId].value += summary.currentValue

      const p = entry.product
      if (p) {
        if (!productStock[p.id]) {
          productStock[p.id] = { name: p.name, code: p.code, wattage: p.wattage, threshold: p.lowStockThreshold, available: 0 }
        }
        productStock[p.id].available += summary.availableQuantity
      }
    }

    const lowStock = Object.values(productStock)
      .filter((p) => p.available < p.threshold)
      .sort((a, b) => a.available / Math.max(a.threshold, 1) - b.available / Math.max(b.threshold, 1))
      .slice(0, 6)

    // Rolling 6-month sales vs collections trend
    const monthKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}`
    const trendMonths: { key: string; label: string; sales: number; collections: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(todayStart.getFullYear(), todayStart.getMonth() - i, 1)
      trendMonths.push({
        key: monthKey(d),
        label: d.toLocaleString("en", { month: "short" }),
        sales: 0,
        collections: 0,
      })
    }
    const trendByKey = Object.fromEntries(trendMonths.map((m) => [m.key, m]))
    for (const so of trendSOs) {
      const m = trendByKey[monthKey(so.orderDate)]
      if (m) m.sales += so.grandTotal
    }
    for (const r of trendReceipts) {
      const m = trendByKey[monthKey(r.valueDate)]
      if (m) m.collections += r.amount
    }

    // Top outstanding customers: Σ SO − Σ receipts per customer
    const customerName = Object.fromEntries(customers.map((c) => [c.id, c.name]))
    const receiptByCustomer = Object.fromEntries(
      customerReceiptSums.map((r) => [r.customerId, r._sum.amount ?? 0])
    )
    const topOutstanding = customerSoSums
      .map((s) => ({
        customerId: s.customerId,
        name: customerName[s.customerId] ?? "Unknown",
        outstanding: (s._sum.grandTotal ?? 0) - (receiptByCustomer[s.customerId] ?? 0),
      }))
      .filter((c) => c.outstanding > 0.5)
      .sort((a, b) => b.outstanding - a.outstanding)
      .slice(0, 6)

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
        monthSales: monthOrders._sum.grandTotal || 0,
        monthSalesCount: monthOrders._count,
        totalReceivables,
        monthCollections: monthReceipts._sum.amount || 0,
        monthCollectionsCount: monthReceipts._count,
        todayCollections: todayReceipts._sum.amount || 0,
        todayCollectionsCount: todayReceipts._count,
        monthExpenses: monthExpenses._sum.amount || 0,
        monthExpensesCount: monthExpenses._count,
        totalGstInStock,
        activePOs: activePOAgg._count,
        activePOPanels: activePOAgg._sum.noOfPanels || 0,
        activePOValue: activePOAgg._sum.poAmountPkr || 0,
        openDeliveryOrders: openDeliveryOrders.length,
        agingDeliveryOrders: openDeliveryOrders.filter((order) => {
          const ageInDays = Math.floor((Date.now() - order.createdAt.getTime()) / (1000 * 60 * 60 * 24))
          return ageInDays >= 2
        }).length,
      },
      monthlyTrend: trendMonths.map(({ label, sales, collections }) => ({ label, sales, collections })),
      poStatusBreakdown: poGroups.map((g) => ({
        status: g.status,
        count: g._count,
        panels: g._sum.noOfPanels || 0,
        value: g._sum.poAmountPkr || 0,
      })),
      soStatusBreakdown: soStatusGroups.map((g) => ({ status: g.status, count: g._count })),
      recentOrders: recentSOs,
      recentReceipts,
      warehouseStock: Object.values(warehouseStock),
      lowStock,
      topOutstanding,
    })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to fetch dashboard data" }, { status: 500 })
  }
}
