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

    // Full edit for DRAFT orders
    if (data.editLines) {
      const existing = await prisma.salesOrder.findUnique({ where: { id } })
      if (!existing || existing.status !== "DRAFT") {
        return Response.json({ error: "Only DRAFT orders can be edited" }, { status: 422 })
      }

      const subTotal = (data.lines || []).reduce(
        (s: number, l: { totalAmount: string | number }) => s + parseFloat(l.totalAmount as string),
        0
      )
      const gstRate = data.gstInvoice ? (parseFloat(data.gstRate) || 0) : 0
      const gstAmount = subTotal * (gstRate / 100)
      const grandTotal = subTotal + gstAmount

      const order = await prisma.salesOrder.update({
        where: { id },
        data: {
          customerId: data.customerId,
          customerType: data.customerType || "DIRECT",
          paymentTerms: data.paymentTerms || "FULL_PAYMENT",
          gstRate,
          subTotal,
          gstAmount,
          grandTotal,
          notes: data.notes,
          lines: {
            deleteMany: {},
            create: (data.lines || []).map((line: {
              productId: string
              quantity: string | number
              watts: string | number
              ratePerWatt: string | number
              ratePerPanel: string | number
              totalAmount: string | number
            }) => ({
              productId: line.productId,
              quantity: parseInt(line.quantity as string),
              watts: parseInt(line.watts as string),
              ratePerWatt: parseFloat(line.ratePerWatt as string),
              ratePerPanel: parseFloat(line.ratePerPanel as string),
              totalAmount: parseFloat(line.totalAmount as string),
            })),
          },
        },
        include: { customer: true, lines: { include: { product: true } } },
      })

      await prisma.partyLedger.updateMany({
        where: { soId: id },
        data: { debit: grandTotal, balance: grandTotal },
      })

      return Response.json(order)
    }

    // Status / proof / notes update
    const updateData: Record<string, unknown> = {}
    if (data.status !== undefined) updateData.status = data.status
    if (data.paymentProofUrl !== undefined) updateData.paymentProofUrl = data.paymentProofUrl
    if (data.notes !== undefined) updateData.notes = data.notes

    const order = await prisma.salesOrder.update({ where: { id }, data: updateData })
    return Response.json(order)
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to update sales order" }, { status: 500 })
  }
}
