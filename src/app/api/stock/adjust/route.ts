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
    const { stockEntryId, adjustmentType, quantity, reason, category } = data

    if (!stockEntryId || !adjustmentType || !quantity || !reason) {
      return Response.json({ error: "stockEntryId, adjustmentType, quantity, and reason are required" }, { status: 400 })
    }

    const entry = await prisma.stockEntry.findUnique({
      where: { id: stockEntryId },
      include: { movements: true, product: { select: { wattage: true } } },
    })

    if (!entry) return Response.json({ error: "Stock entry not found" }, { status: 404 })

    const qty = parseInt(quantity)
    if (!Number.isFinite(qty) || qty <= 0) {
      return Response.json({ error: "Quantity must be greater than 0" }, { status: 400 })
    }
    const wattsPerPanel = entry.panelQuantity > 0 ? entry.wattQuantity / entry.panelQuantity : entry.product.wattage || 0

    if (adjustmentType === "INCREASE") {
      // Found stock / correction — a self-standing cost layer at an admin-entered cost.
      const customCost = data.unitCost !== undefined && data.unitCost !== "" ? Number(data.unitCost) : entry.costPerPanel
      if (!Number.isFinite(customCost) || customCost < 0) {
        return Response.json({ error: "Enter a valid cost per panel" }, { status: 400 })
      }
      const watts = Math.round(qty * wattsPerPanel)
      const costPerWatt = wattsPerPanel > 0 ? customCost / wattsPerPanel : 0
      const totalValue = qty * customCost

      const newEntry = await prisma.stockEntry.create({
        data: {
          productId: entry.productId,
          warehouseId: entry.warehouseId,
          poId: null,
          panelQuantity: qty,
          wattQuantity: watts,
          costPerPanel: customCost,
          costPerWatt,
          totalValue,
          origin: "ADJUSTMENT",
          adjustmentCategory: category || null,
          adjustmentReason: reason,
        },
      })

      await writeAuditLog({
        userId: session.userId,
        action: "STOCK_ADJUSTMENT",
        entity: "StockEntry",
        entityId: newEntry.id,
        changes: { adjustmentType, quantity: qty, unitCost: customCost, value: totalValue, category, reason, sourceEntryId: stockEntryId },
      })

      return Response.json({ ...newEntry, adjustmentType: "INCREASE", value: totalValue }, { status: 201 })
    }

    // DECREASE — write off from this cost layer at its actual cost.
    const stockSummary = summarizeStockEntry(entry)
    const available = stockSummary.availableQuantity
    if (qty > available) {
      return Response.json({ error: `Cannot decrease by ${qty} panels. Only ${available} available.` }, { status: 400 })
    }

    const unitCost = entry.costPerPanel
    const value = qty * unitCost

    const movement = await prisma.stockMovement.create({
      data: {
        stockEntryId,
        type: "ADJUSTMENT",
        quantity: -qty,
        watts: -Math.round(qty * wattsPerPanel),
        unitCost,
        category: category || null,
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
      changes: { stockEntryId, adjustmentType, quantity: qty, unitCost, value, category, reason },
    })

    return Response.json({ ...movement, adjustmentType: "DECREASE", value }, { status: 201 })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to create adjustment" }, { status: 500 })
  }
}
