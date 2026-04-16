import { prisma } from "@/lib/prisma"

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const quotation = await prisma.quotation.findUnique({
      where: { id },
      include: {
        customer: true,
        lines: { include: { product: true } },
        salesOrders: true,
      },
    })
    if (!quotation) return Response.json({ error: "Not found" }, { status: 404 })
    return Response.json(quotation)
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to fetch quotation" }, { status: 500 })
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const data = await request.json()
    const quotation = await prisma.quotation.update({
      where: { id },
      data: {
        status: data.status,
        validUntil: data.validUntil ? new Date(data.validUntil) : undefined,
        notes: data.notes,
      },
    })
    return Response.json(quotation)
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to update quotation" }, { status: 500 })
  }
}
