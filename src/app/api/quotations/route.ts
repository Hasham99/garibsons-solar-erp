import { prisma } from "@/lib/prisma"
import { getNextRef } from "@/lib/counter"

export async function GET() {
  try {
    const quotations = await prisma.quotation.findMany({
      include: {
        customer: true,
        lines: { include: { product: true } },
      },
      orderBy: { createdAt: "desc" },
    })
    return Response.json(quotations)
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to fetch quotations" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const data = await request.json()
    const qNumber = await getNextRef("QUOT", "QT")

    const quotation = await prisma.quotation.create({
      data: {
        qNumber,
        customerId: data.customerId,
        validUntil: data.validUntil ? new Date(data.validUntil) : null,
        notes: data.notes,
        status: data.status || "DRAFT",
        lines: {
          create: (data.lines || []).map((line: {
            productId: string
            quantity: number
            watts: number
            ratePerWatt: number
            ratePerPanel: number
            totalAmount: number
          }) => ({
            productId: line.productId,
            quantity: parseInt(line.quantity as unknown as string),
            watts: parseInt(line.watts as unknown as string),
            ratePerWatt: parseFloat(line.ratePerWatt as unknown as string),
            ratePerPanel: parseFloat(line.ratePerPanel as unknown as string),
            totalAmount: parseFloat(line.totalAmount as unknown as string),
          })),
        },
      },
      include: {
        customer: true,
        lines: { include: { product: true } },
      },
    })
    return Response.json(quotation, { status: 201 })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to create quotation" }, { status: 500 })
  }
}
