import { prisma } from "@/lib/prisma"
import { summarizeStockEntry } from "@/lib/stock"

export async function GET() {
  try {
    const stock = await prisma.stockEntry.findMany({
      include: {
        product: true,
        warehouse: true,
        po: { select: { poNumber: true, gstInputAmount: true, noOfPanels: true } },
        movements: {
          select: { type: true, quantity: true, watts: true },
        },
      },
      orderBy: { receivedAt: "desc" },
    })

    const now = new Date()

    const stockWithRemaining = stock.map((entry) => {
      const summary = summarizeStockEntry(entry, now)
      const gstPerPanel =
        entry.po?.gstInputAmount && entry.po.noOfPanels > 0
          ? entry.po.gstInputAmount / entry.po.noOfPanels
          : 0

      return {
        ...entry,
        ...summary,
        gstPerPanel,
        gstCurrentValue: gstPerPanel * summary.currentQuantity,
      }
    })

    return Response.json(stockWithRemaining)
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to fetch stock" }, { status: 500 })
  }
}
