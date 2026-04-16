import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"

export async function POST(request: Request) {
  try {
    const data = await request.json()
    const session = await getSession()

    const po = await prisma.purchaseOrder.findUnique({ where: { id: data.poId } })
    if (!po) return Response.json({ error: "PO not found" }, { status: 404 })

    const panelQuantity = parseInt(data.panelQuantity)
    const wattQuantity = parseInt(data.wattQuantity || panelQuantity * po.panelWattage)
    const costPerPanel = parseFloat(data.costPerPanel || po.landedCostPerPanel || po.poAmountPkr / po.noOfPanels)
    const costPerWatt = parseFloat(data.costPerWatt || po.landedCostPerWatt || costPerPanel / po.panelWattage)
    const totalValue = costPerPanel * panelQuantity

    const entry = await prisma.stockEntry.create({
      data: {
        productId: po.productId,
        warehouseId: data.warehouseId || po.warehouseId!,
        poId: po.id,
        lcReference: data.lcReference || po.lcNumber,
        panelQuantity,
        wattQuantity,
        costPerPanel,
        costPerWatt,
        totalValue,
        receivedAt: data.receivedAt ? new Date(data.receivedAt) : new Date(),
      },
    })

    // Create stock movement
    await prisma.stockMovement.create({
      data: {
        stockEntryId: entry.id,
        type: "STOCK_IN",
        quantity: panelQuantity,
        watts: wattQuantity,
        poId: po.id,
        reason: `Stock received from PO ${po.poNumber}`,
      },
    })

    // Update PO status
    await prisma.purchaseOrder.update({
      where: { id: po.id },
      data: { status: "RECEIVED" },
    })

    await writeAuditLog({
      userId: session.userId,
      action: "STOCK_RECEIVE",
      entity: "StockEntry",
      entityId: entry.id,
      changes: { poId: po.id, panelQuantity, wattQuantity, costPerPanel, totalValue },
    })

    return Response.json(entry, { status: 201 })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to receive stock" }, { status: 500 })
  }
}
