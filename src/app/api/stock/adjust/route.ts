import { prisma } from "@/lib/prisma"
import { requireModule } from "@/lib/permissions/guard"
import { writeAuditLog } from "@/lib/audit"
import { summarizeStockEntry } from "@/lib/stock"

export async function POST(request: Request) {
  try {
    const auth = await requireModule("stock", "write")
    if (auth instanceof Response) return auth
    const session = auth.session

    const data = await request.json()
    const { stockEntryId, adjustmentType, quantity, reason } = data

    if (!stockEntryId || !adjustmentType || !quantity || !reason) {
      return Response.json({ error: "stockEntryId, adjustmentType, quantity, and reason are required" }, { status: 400 })
    }

    const entry = await prisma.stockEntry.findUnique({
      where: { id: stockEntryId },
      include: { movements: true },
    })

    if (!entry) return Response.json({ error: "Stock entry not found" }, { status: 404 })

    const stockSummary = summarizeStockEntry(entry)
    const available = stockSummary.availableQuantity

    const qty = parseInt(quantity)
    const adjustQty = adjustmentType === "INCREASE" ? qty : -qty
    const wattsPerPanel = entry.panelQuantity > 0 ? entry.wattQuantity / entry.panelQuantity : 0

    // Prevent negative stock
    if (adjustmentType === "DECREASE" && qty > available) {
      return Response.json({
        error: `Cannot decrease by ${qty} panels. Only ${available} available.`,
      }, { status: 400 })
    }

    const movement = await prisma.stockMovement.create({
      data: {
        stockEntryId,
        type: "ADJUSTMENT",
        quantity: adjustQty,
        watts: Math.round(adjustQty * wattsPerPanel),
        reason,
        approvedBy: session.name || "Unknown",
        userId: session.userId || null,
      },
    })

    await writeAuditLog({
      userId: session.userId,
      action: "STOCK_ADJUSTMENT",
      entity: "StockMovement",
      entityId: movement.id,
      changes: { stockEntryId, adjustmentType, quantity: qty, reason },
    })

    return Response.json(movement, { status: 201 })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to create adjustment" }, { status: 500 })
  }
}
