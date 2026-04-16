import { prisma } from "@/lib/prisma"
import { getNextRef } from "@/lib/counter"
import { getSession } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"

export async function GET() {
  try {
    const invoices = await prisma.invoice.findMany({
      include: {
        salesOrder: { include: { customer: true } },
        deliveryOrder: true,
        payments: true,
      },
      orderBy: { createdAt: "desc" },
    })
    return Response.json(invoices)
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to fetch invoices" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const data = await request.json()
    const session = await getSession()
    const invoiceNumber = await getNextRef("INV", "INV")

    const so = await prisma.salesOrder.findUnique({ where: { id: data.soId } })
    if (!so) return Response.json({ error: "Sales order not found" }, { status: 404 })

    const subTotal = parseFloat(data.subTotal || so.subTotal as unknown as string)
    const gstRate = parseFloat(data.gstRate || so.gstRate as unknown as string)
    const gstAmount = subTotal * (gstRate / 100)
    const grandTotal = subTotal + gstAmount

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber,
        soId: data.soId,
        doId: data.doId || null,
        customerId: so.customerId,
        invoiceDate: data.invoiceDate ? new Date(data.invoiceDate) : new Date(),
        subTotal,
        gstRate,
        gstAmount,
        grandTotal,
        status: "UNPAID",
        notes: data.notes,
      },
      include: {
        salesOrder: { include: { customer: true } },
        deliveryOrder: true,
      },
    })

    // Create ledger entry
    await prisma.partyLedger.create({
      data: {
        customerId: so.customerId,
        date: new Date(),
        description: `Invoice ${invoiceNumber}`,
        debit: grandTotal,
        credit: 0,
        balance: grandTotal,
        invoiceId: invoice.id,
        soId: data.soId,
      },
    })

    // Update SO status
    await prisma.salesOrder.update({
      where: { id: data.soId },
      data: { status: "INVOICED" },
    })

    await writeAuditLog({
      userId: session.userId,
      action: "CREATE",
      entity: "Invoice",
      entityId: invoice.id,
      changes: { invoiceNumber, soId: data.soId, grandTotal },
    })

    return Response.json(invoice, { status: 201 })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to create invoice" }, { status: 500 })
  }
}
