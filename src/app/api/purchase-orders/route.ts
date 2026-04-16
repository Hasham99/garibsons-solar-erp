import { prisma } from "@/lib/prisma"
import { getNextRef } from "@/lib/counter"
import { getSession } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"

export async function GET() {
  try {
    const pos = await prisma.purchaseOrder.findMany({
      include: {
        product: true,
        supplier: true,
        warehouse: true,
        bank: true,
        exchangeRate: true,
        costing: true,
        documents: true,
      },
      orderBy: { createdAt: "desc" },
    })
    return Response.json(pos)
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to fetch purchase orders" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const data = await request.json()
    const session = await getSession()
    const poNumber = await getNextRef("PO", "PO")

    const po = await prisma.purchaseOrder.create({
      data: {
        poNumber,
        productId: data.productId,
        supplierId: data.supplierId,
        lcType: data.lcType || "TT",
        lcNumber: data.lcNumber,
        usanceDays: data.usanceDays ? parseInt(data.usanceDays) : null,
        bankId: data.bankId || null,
        leadTimeDays: data.leadTimeDays ? parseInt(data.leadTimeDays) : null,
        warehouseId: data.warehouseId || null,
        noOfContainers: data.noOfContainers ? parseInt(data.noOfContainers) : null,
        noOfPallets: data.noOfPallets ? parseInt(data.noOfPallets) : null,
        noOfPanels: parseInt(data.noOfPanels),
        panelWattage: parseInt(data.panelWattage),
        totalWatts: parseInt(data.totalWatts || data.noOfPanels * data.panelWattage),
        usdPerWatt: parseFloat(data.usdPerWatt),
        totalValueUsd: parseFloat(data.totalValueUsd),
        exchangeRateId: data.exchangeRateId || null,
        poAmountPkr: parseFloat(data.poAmountPkr),
        costingId: data.costingId || null,
        status: data.status || "DRAFT",
        notes: data.notes,
      },
      include: {
        product: true,
        supplier: true,
        warehouse: true,
      },
    })
    await writeAuditLog({
      userId: session.userId,
      action: "CREATE",
      entity: "PurchaseOrder",
      entityId: po.id,
      changes: { poNumber, productId: data.productId, noOfPanels: data.noOfPanels, totalValueUsd: data.totalValueUsd },
    })

    return Response.json(po, { status: 201 })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to create purchase order" }, { status: 500 })
  }
}
