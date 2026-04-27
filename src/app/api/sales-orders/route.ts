import { prisma } from "@/lib/prisma"
import { getNextRef } from "@/lib/counter"
import { getSession } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"

export async function GET() {
  try {
    const orders = await prisma.salesOrder.findMany({
      include: {
        customer: true,
        lines: { include: { product: true } },
        createdBy: { select: { name: true } },
        deliveryOrders: { select: { status: true, quantity: true } },
      },
      orderBy: { createdAt: "desc" },
    })
    return Response.json(orders)
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to fetch sales orders" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const data = await request.json()
    const session = await getSession()
    const soNumber = await getNextRef("SO", "SO")

    const subTotal = (data.lines || []).reduce((s: number, l: { totalAmount: string | number }) => s + parseFloat(l.totalAmount as string), 0)
    const gstRate = data.gstInvoice ? (parseFloat(data.gstRate) || 0) : 0
    const gstAmount = subTotal * (gstRate / 100)
    const grandTotal = subTotal + gstAmount

    // PRD §7.3: Credit limit enforcement
    if (data.customerId) {
      const customer = await prisma.customer.findUnique({
        where: { id: data.customerId },
        select: { creditLimit: true, name: true },
      })
      if (customer?.creditLimit && customer.creditLimit > 0) {
        // Sum outstanding (unpaid/partially-paid) invoices for this customer
        const outstanding = await prisma.invoice.aggregate({
          where: {
            salesOrder: { customerId: data.customerId },
            status: { in: ["UNPAID", "PARTIALLY_PAID"] },
          },
          _sum: { grandTotal: true },
        })
        const outstandingAmount = outstanding._sum.grandTotal ?? 0
        if (outstandingAmount + grandTotal > customer.creditLimit) {
          return Response.json(
            {
              error: `Credit limit exceeded. Customer limit: Rs ${customer.creditLimit.toLocaleString()}, Outstanding: Rs ${outstandingAmount.toLocaleString()}, This order: Rs ${grandTotal.toLocaleString()}`,
            },
            { status: 422 }
          )
        }
      }
    }

    const order = await prisma.salesOrder.create({
      data: {
        soNumber,
        quotationId: data.quotationId || null,
        customerId: data.customerId,
        customerType: data.customerType || "DIRECT",
        paymentTerms: data.paymentTerms || "FULL_PAYMENT",
        status: "DRAFT",
        gstRate,
        subTotal,
        gstAmount,
        grandTotal,
        notes: data.notes,
        createdById: session.userId || null,
        lines: {
          create: (data.lines || []).map((line: {
            productId: string
            quantity: string | number
            watts: string | number
            ratePerWatt: string | number
            ratePerPanel: string | number
            totalAmount: string | number
            stockEntryId?: string
          }) => ({
            productId: line.productId,
            quantity: parseInt(line.quantity as string),
            watts: parseInt(line.watts as string),
            ratePerWatt: parseFloat(line.ratePerWatt as string),
            ratePerPanel: parseFloat(line.ratePerPanel as string),
            totalAmount: parseFloat(line.totalAmount as string),
            stockEntryId: line.stockEntryId || null,
          })),
        },
      },
      include: {
        customer: true,
        lines: { include: { product: true } },
      },
    })

    // Create ledger entry
    await prisma.partyLedger.create({
      data: {
        customerId: data.customerId,
        date: new Date(),
        description: `Sales Order ${soNumber}`,
        debit: grandTotal,
        credit: 0,
        balance: grandTotal,
        soId: order.id,
      },
    })

    await writeAuditLog({
      userId: session.userId,
      action: "CREATE",
      entity: "SalesOrder",
      entityId: order.id,
      changes: { soNumber, customerId: data.customerId, grandTotal },
    })

    return Response.json(order, { status: 201 })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to create sales order" }, { status: 500 })
  }
}
