import { prisma } from "@/lib/prisma"

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        salesOrder: { include: { customer: true, lines: { include: { product: true } } } },
        deliveryOrder: true,
        payments: true,
        ledgerEntries: true,
      },
    })
    if (!invoice) return Response.json({ error: "Not found" }, { status: 404 })
    return Response.json(invoice)
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to fetch invoice" }, { status: 500 })
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const data = await request.json()
    const invoice = await prisma.invoice.update({
      where: { id },
      data: {
        status: data.status,
        notes: data.notes,
      },
    })
    return Response.json(invoice)
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to update invoice" }, { status: 500 })
  }
}
