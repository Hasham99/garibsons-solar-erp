import { prisma } from "@/lib/prisma"
import { requireModule } from "@/lib/permissions/guard"
import { writeAuditLog } from "@/lib/audit"

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireModule("stock", "write")
    if (auth instanceof Response) return auth
    const session = auth.session

    const { id } = await params
    const data = await request.json()

    const existing = await prisma.stockEntry.findUnique({
      where: { id },
      include: { product: true, movements: { select: { type: true } } },
    })
    if (!existing) return Response.json({ error: "Stock entry not found" }, { status: 404 })

    // Edit Entry only corrects the original receipt. Once stock has moved
    // (dispatched, reserved or adjusted) the quantity is locked — real changes
    // go through Adjust Stock so they carry a cost/P&L impact.
    const hasActivity = existing.movements.some((m) =>
      ["STOCK_OUT", "RESERVATION", "RELEASE", "ADJUSTMENT"].includes(m.type)
    )
    const requestedQty =
      data.panelQuantity !== undefined && data.panelQuantity !== "" ? parseInt(data.panelQuantity) : existing.panelQuantity
    if (hasActivity && requestedQty !== existing.panelQuantity) {
      return Response.json(
        { error: "This batch already has stock movements — quantity can't be edited here. Use Adjust Stock to increase/decrease." },
        { status: 422 }
      )
    }

    const panelQuantity = Number.isFinite(requestedQty) && requestedQty > 0 ? requestedQty : existing.panelQuantity
    const wattQuantity = panelQuantity * existing.product.wattage
    const costPerPanel =
      data.costPerPanel !== undefined && data.costPerPanel !== "" ? parseFloat(data.costPerPanel) : existing.costPerPanel
    const costPerWatt =
      data.costPerWatt !== undefined && data.costPerWatt !== "" ? parseFloat(data.costPerWatt) : existing.costPerWatt
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
