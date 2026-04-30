import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const data = await request.json()
    const session = await getSession()

    const existing = await prisma.stockEntry.findUnique({
      where: { id },
      include: { product: true },
    })
    if (!existing) return Response.json({ error: "Stock entry not found" }, { status: 404 })

    const panelQuantity = parseInt(data.panelQuantity) || existing.panelQuantity
    const wattQuantity = panelQuantity * existing.product.wattage
    const costPerPanel = parseFloat(data.costPerPanel) || existing.costPerPanel
    const costPerWatt = parseFloat(data.costPerWatt) || existing.costPerWatt
    const totalValue = costPerPanel * panelQuantity
    const receivedAt = data.receivedAt ? new Date(data.receivedAt) : existing.receivedAt

    const updated = await prisma.stockEntry.update({
      where: { id },
      data: { panelQuantity, wattQuantity, costPerPanel, costPerWatt, totalValue, receivedAt },
    })

    // Update the initial STOCK_IN movement to reflect the corrected quantity
    await prisma.stockMovement.updateMany({
      where: { stockEntryId: id, type: "STOCK_IN" },
      data: { quantity: panelQuantity, watts: wattQuantity },
    })

    await writeAuditLog({
      userId: session.userId,
      action: "UPDATE",
      entity: "StockEntry",
      entityId: id,
      changes: { panelQuantity, costPerPanel, costPerWatt, totalValue },
    })

    return Response.json(updated)
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to update stock entry" }, { status: 500 })
  }
}
