import { prisma } from "@/lib/prisma"

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const po = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        product: true,
        supplier: true,
        warehouse: true,
        bank: true,
        exchangeRate: true,
        costing: true,
        documents: true,
        stockEntries: { include: { warehouse: true } },
      },
    })
    if (!po) return Response.json({ error: "Not found" }, { status: 404 })
    return Response.json(po)
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to fetch purchase order" }, { status: 500 })
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const data = await request.json()

    // Build update payload — only include fields that are explicitly provided
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update: Record<string, any> = {}

    if (data.status !== undefined)       update.status       = data.status
    if (data.notes  !== undefined)       update.notes        = data.notes ?? null
    if (data.lcNumber !== undefined)     update.lcNumber     = data.lcNumber || null
    if (data.usanceDays !== undefined)   update.usanceDays   = data.usanceDays ? parseInt(data.usanceDays) : null
    if (data.bankId !== undefined)       update.bankId       = data.bankId || null
    if (data.warehouseId !== undefined)  update.warehouseId  = data.warehouseId || null
    if (data.costingId !== undefined)    update.costingId    = data.costingId || null
    if (data.exchangeRateId !== undefined) update.exchangeRateId = data.exchangeRateId || null

    // Core quantity / pricing fields (sent during full edit)
    if (data.productId !== undefined)    update.productId    = data.productId
    if (data.supplierId !== undefined)   update.supplierId   = data.supplierId
    if (data.lcType !== undefined)       update.lcType       = data.lcType
    if (data.noOfPanels !== undefined)   update.noOfPanels   = parseInt(data.noOfPanels)
    if (data.panelWattage !== undefined) update.panelWattage = parseInt(data.panelWattage)
    if (data.totalWatts !== undefined)   update.totalWatts   = parseInt(data.totalWatts)
    if (data.usdPerWatt !== undefined)   update.usdPerWatt   = parseFloat(data.usdPerWatt)
    if (data.totalValueUsd !== undefined) update.totalValueUsd = parseFloat(data.totalValueUsd)
    if (data.poAmountPkr !== undefined)  update.poAmountPkr  = parseFloat(data.poAmountPkr)
    if (data.noOfContainers !== undefined) update.noOfContainers = data.noOfContainers ? parseInt(data.noOfContainers) : null
    if (data.noOfPallets !== undefined)  update.noOfPallets  = data.noOfPallets ? parseInt(data.noOfPallets) : null

    const po = await prisma.purchaseOrder.update({ where: { id }, data: update })
    return Response.json(po)
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to update purchase order" }, { status: 500 })
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await prisma.purchaseOrder.update({ where: { id }, data: { status: "CANCELLED" } })
    return Response.json({ success: true })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to cancel purchase order" }, { status: 500 })
  }
}
