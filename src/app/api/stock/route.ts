import { prisma } from "@/lib/prisma"
import { summarizeStockEntry } from "@/lib/stock"

export async function GET() {
  try {
    const stock = await prisma.stockEntry.findMany({
      include: {
        product: true,
        warehouse: true,
        po: { select: { poNumber: true } },
        movements: {
          select: { type: true, quantity: true, watts: true },
        },
      },
      orderBy: { receivedAt: "desc" },
    })

    const now = new Date()

    const stockWithRemaining = stock.map((entry) => {
      const summary = summarizeStockEntry(entry, now)

      return {
        ...entry,
        ...summary,
      }
    })

    return Response.json(stockWithRemaining)
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to fetch stock" }, { status: 500 })
  }
}
