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
    const po = await prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: data.status,
        lcNumber: data.lcNumber,
        bankId: data.bankId || null,
        warehouseId: data.warehouseId || null,
        notes: data.notes,
        noOfContainers: data.noOfContainers ? parseInt(data.noOfContainers) : undefined,
        noOfPallets: data.noOfPallets ? parseInt(data.noOfPallets) : undefined,
      },
    })
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
