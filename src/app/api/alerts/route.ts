import { prisma } from "@/lib/prisma"
import { summarizeStockEntry } from "@/lib/stock"

/** Lightweight operational alerts for the header bell: aging DOs + low stock. */
export async function GET() {
  try {
    const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000)

    const [agingDOs, stockEntries] = await Promise.all([
      prisma.deliveryOrder.findMany({
        where: { status: { in: ["PENDING", "AUTHORIZED"] }, createdAt: { lte: twoDaysAgo } },
        select: {
          id: true,
          doNumber: true,
          createdAt: true,
          quantity: true,
          salesOrder: { select: { soNumber: true, customer: { select: { name: true } } } },
        },
        orderBy: { createdAt: "asc" },
        take: 10,
      }),
      prisma.stockEntry.findMany({
        include: {
          movements: { select: { type: true, quantity: true } },
          product: { select: { id: true, name: true, code: true, lowStockThreshold: true } },
        },
      }),
    ])

    // Per-product availability vs threshold (same model as the dashboard)
    const productStock: Record<string, { name: string; code: string; threshold: number; available: number }> = {}
    for (const entry of stockEntries) {
      const p = entry.product
      if (!p) continue
      const summary = summarizeStockEntry(entry)
      if (!productStock[p.id]) {
        productStock[p.id] = { name: p.name, code: p.code, threshold: p.lowStockThreshold, available: 0 }
      }
      productStock[p.id].available += summary.availableQuantity
    }
    const lowStock = Object.values(productStock)
      .filter((p) => p.available < p.threshold)
      .sort((a, b) => a.available / Math.max(a.threshold, 1) - b.available / Math.max(b.threshold, 1))
      .slice(0, 6)

    return Response.json({
      agingDeliveryOrders: agingDOs.map((d) => ({
        id: d.id,
        doNumber: d.doNumber,
        soNumber: d.salesOrder.soNumber,
        customerName: d.salesOrder.customer.name,
        quantity: d.quantity,
        ageDays: Math.floor((Date.now() - d.createdAt.getTime()) / 86_400_000),
      })),
      lowStock,
    })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to fetch alerts" }, { status: 500 })
  }
}
