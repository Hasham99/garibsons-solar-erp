import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"

export async function PUT(request: Request, { params }: { params: Promise<{ id: string; rid: string }> }) {
  try {
    const session = await getSession()
    if (!session.isLoggedIn) return Response.json({ error: "Unauthorized" }, { status: 401 })
    if (session.role !== "ADMIN") {
      return Response.json({ error: "Only admins can edit receipts" }, { status: 403 })
    }

    const { id: customerId, rid: receiptId } = await params
    const data = await request.json()
    const { bankId, amount, reference, valueDate, whatsappDate, notes } = data

    if (!bankId || !amount || !valueDate) {
      return Response.json({ error: "bankId, amount, and valueDate are required" }, { status: 400 })
    }

    const parsedAmount = parseFloat(amount)
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return Response.json({ error: "Amount must be a positive number" }, { status: 400 })
    }

    const existing = await prisma.customerReceipt.findUnique({ where: { id: receiptId } })
    if (!existing || existing.customerId !== customerId) {
      return Response.json({ error: "Receipt not found" }, { status: 404 })
    }

    const receipt = await prisma.customerReceipt.update({
      where: { id: receiptId },
      data: {
        bankId,
        amount: parsedAmount,
        reference: reference || null,
        valueDate: new Date(valueDate),
        whatsappDate: whatsappDate ? new Date(whatsappDate) : null,
        notes: notes || null,
      },
      include: { bank: { select: { name: true } } },
    })

    await writeAuditLog({
      userId: session.userId,
      action: "UPDATE",
      entity: "CustomerReceipt",
      entityId: receiptId,
      changes: { amount: parsedAmount, bankId },
    })

    return Response.json(receipt)
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to update receipt" }, { status: 500 })
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string; rid: string }> }) {
  try {
    const session = await getSession()
    if (!session.isLoggedIn) return Response.json({ error: "Unauthorized" }, { status: 401 })
    if (!["ADMIN", "ACCOUNTS"].includes(session.role || "")) {
      return Response.json({ error: "Only admin or accounts can delete collections" }, { status: 403 })
    }

    const { id: customerId, rid: receiptId } = await params
    const existing = await prisma.customerReceipt.findUnique({ where: { id: receiptId } })
    if (!existing || existing.customerId !== customerId) {
      return Response.json({ error: "Receipt not found" }, { status: 404 })
    }

    await prisma.customerReceipt.delete({ where: { id: receiptId } })

    await writeAuditLog({
      userId: session.userId,
      action: "DELETE",
      entity: "CustomerReceipt",
      entityId: receiptId,
      changes: { receiptNo: existing.receiptNo, amount: existing.amount, customerId },
    })

    return Response.json({ ok: true })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to delete receipt" }, { status: 500 })
  }
}
