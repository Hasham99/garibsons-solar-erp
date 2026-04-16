import { prisma } from "@/lib/prisma"
import { summarizeStockEntries, summarizeStockEntry } from "@/lib/stock"

export async function GET() {
  try {
    const stockEntries = await prisma.stockEntry.findMany({
      include: {
        product: true,
        warehouse: true,
        movements: { select: { type: true, quantity: true, watts: true } },
      },
    })

    const byWarehouse: Record<
      string,
      { name: string; currentPanels: number; reservedPanels: number; availablePanels: number; value: number }
    > = {}
    const bySKU: Record<
      string,
      { name: string; code: string; currentPanels: number; reservedPanels: number; availablePanels: number; value: number }
    > = {}

    const totals = summarizeStockEntries(stockEntries)

    for (const entry of stockEntries) {
      const summary = summarizeStockEntry(entry)
      const value = summary.currentValue

      // By warehouse
      const wId = entry.warehouseId
      if (!byWarehouse[wId]) {
        byWarehouse[wId] = { name: entry.warehouse.name, currentPanels: 0, reservedPanels: 0, availablePanels: 0, value: 0 }
      }
      byWarehouse[wId].currentPanels += summary.currentQuantity
      byWarehouse[wId].reservedPanels += summary.reservedQuantity
      byWarehouse[wId].availablePanels += summary.availableQuantity
      byWarehouse[wId].value += value

      // By SKU
      const pId = entry.productId
      if (!bySKU[pId]) {
        bySKU[pId] = { name: entry.product.name, code: entry.product.code, currentPanels: 0, reservedPanels: 0, availablePanels: 0, value: 0 }
      }
      bySKU[pId].currentPanels += summary.currentQuantity
      bySKU[pId].reservedPanels += summary.reservedQuantity
      bySKU[pId].availablePanels += summary.availableQuantity
      bySKU[pId].value += value
    }

    return Response.json({
      totalPanels: totals.currentPanels,
      reservedPanels: totals.reservedPanels,
      availablePanels: totals.availablePanels,
      totalValue: totals.currentValue,
      reservedValue: totals.reservedValue,
      availableValue: totals.availableValue,
      byWarehouse: Object.values(byWarehouse),
      bySKU: Object.values(bySKU),
    })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to fetch stock dashboard" }, { status: 500 })
  }
}
