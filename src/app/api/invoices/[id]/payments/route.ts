import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const data = await request.json()
    const session = await getSession()

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: { payments: true },
    })
    if (!invoice) return Response.json({ error: "Invoice not found" }, { status: 404 })

    const payment = await prisma.payment.create({
      data: {
        invoiceId: id,
        amount: parseFloat(data.amount),
        paymentDate: new Date(data.paymentDate || new Date()),
        method: data.method,
        reference: data.reference,
        notes: data.notes,
      },
    })

    // Create ledger credit entry
    await prisma.partyLedger.create({
      data: {
        customerId: invoice.customerId,
        date: new Date(data.paymentDate || new Date()),
        description: `Payment received - ${data.reference || payment.id}`,
        debit: 0,
        credit: parseFloat(data.amount),
        balance: 0, // Will be recalculated
        invoiceId: id,
      },
    })

    // Check if invoice is fully paid
    const totalPaid = invoice.payments.reduce((s, p) => s + p.amount, 0) + parseFloat(data.amount)
    if (totalPaid >= invoice.grandTotal) {
      await prisma.invoice.update({
        where: { id },
        data: { status: "PAID" },
      })
    } else if (totalPaid > 0) {
      await prisma.invoice.update({
        where: { id },
        data: { status: "PARTIAL" },
      })
    }

    await writeAuditLog({
      userId: session.userId,
      action: "PAYMENT",
      entity: "Invoice",
      entityId: id,
      changes: { amount: data.amount, method: data.method, reference: data.reference, totalPaid },
    })

    return Response.json(payment, { status: 201 })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to record payment" }, { status: 500 })
  }
}
