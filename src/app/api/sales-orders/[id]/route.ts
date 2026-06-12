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

    // Full edit — allowed until delivery starts (no stock is reserved before a DO exists)
    if (data.editLines) {
      const existing = await prisma.salesOrder.findUnique({ where: { id } })
      const EDITABLE_STATUSES = ["DRAFT", "PENDING_PAYMENT", "PAYMENT_CONFIRMED"]
      if (!existing) {
        return Response.json({ error: "Not found" }, { status: 404 })
      }
      if (!EDITABLE_STATUSES.includes(existing.status)) {
        return Response.json(
          { error: `${existing.soNumber} is ${existing.status.replace(/_/g, " ")} — orders can be edited until a delivery order is issued. Cancel its DOs first to edit.` },
          { status: 422 }
        )
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
          ...(data.orderDate ? { orderDate: new Date(data.orderDate) } : {}),
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
