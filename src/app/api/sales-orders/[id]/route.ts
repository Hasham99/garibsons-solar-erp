import { prisma } from "@/lib/prisma"

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const order = await prisma.salesOrder.findUnique({
      where: { id },
      include: {
        customer: true,
        lines: { include: { product: true } },
        deliveryOrders: { include: { warehouse: true } },
        invoices: true,
        quotation: true,
      },
    })
    if (!order) return Response.json({ error: "Not found" }, { status: 404 })
    return Response.json(order)
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to fetch sales order" }, { status: 500 })
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const data = await request.json()
    const order = await prisma.salesOrder.update({
      where: { id },
      data: {
        status: data.status,
        paymentProofUrl: data.paymentProofUrl,
        notes: data.notes,
      },
    })
    return Response.json(order)
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to update sales order" }, { status: 500 })
  }
}
