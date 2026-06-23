import { prisma } from "@/lib/prisma"
import { requireModule } from "@/lib/permissions/guard"
import { writeAuditLog } from "@/lib/audit"
import { normalizeReferenceKey } from "@/lib/collections/reference"
import { deleteBlob } from "@/lib/storage"

/**
 * Staff edit of a slip — allowed at ANY status.
 * - Verified slips: updates the linked CustomerReceipt (bank / reference /
 *   amount / value date / notes) and mirrors the corrected amount + date onto
 *   the slip's claimed values so the party sees them in the portal.
 * - Other statuses: updates the claimed amount / value date.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModule("payments.slips", "write")
  if (auth instanceof Response) return auth

  try {
    const { id } = await params
    const slip = await prisma.paymentSlip.findUnique({
      where: { id },
      select: { id: true, linkedReceiptId: true },
    })
    if (!slip) return Response.json({ error: "Slip not found" }, { status: 404 })

    const { amount, valueDate, reference, bankId, notes } = await request.json()

    const parsedAmount = amount != null && String(amount) !== "" ? parseFloat(String(amount)) : null
    if (parsedAmount != null && (isNaN(parsedAmount) || parsedAmount <= 0)) {
      return Response.json({ error: "Amount must be a positive number" }, { status: 400 })
    }
    const parsedDate = valueDate ? new Date(String(valueDate)) : null
    if (parsedDate && isNaN(parsedDate.getTime())) {
      return Response.json({ error: "Invalid value date" }, { status: 400 })
    }

    // Party-facing claimed values always mirror the corrected figures.
    const claimedData: { claimedAmount?: number; claimedValueDate?: Date } = {}
    if (parsedAmount != null) claimedData.claimedAmount = parsedAmount
    if (parsedDate) claimedData.claimedValueDate = parsedDate

    if (slip.linkedReceiptId) {
      const receiptData: {
        amount?: number
        valueDate?: Date
        reference?: string | null
        referenceKey?: string | null
        bankId?: string
        notes?: string | null
      } = {}
      if (parsedAmount != null) receiptData.amount = parsedAmount
      if (parsedDate) receiptData.valueDate = parsedDate
      if (reference !== undefined) {
        receiptData.reference = reference || null
        receiptData.referenceKey = normalizeReferenceKey(reference)
      }
      if (bankId) receiptData.bankId = bankId
      if (notes !== undefined) receiptData.notes = notes || null

      await prisma.$transaction([
        prisma.customerReceipt.update({ where: { id: slip.linkedReceiptId }, data: receiptData }),
        prisma.paymentSlip.update({ where: { id }, data: claimedData }),
      ])
    } else {
      await prisma.paymentSlip.update({ where: { id }, data: claimedData })
    }

    await writeAuditLog({
      userId: auth.session.userId,
      action: "UPDATE",
      entity: "PaymentSlip",
      entityId: id,
      changes: { amount: parsedAmount, valueDate: parsedDate?.toISOString() ?? null },
    })

    return Response.json({ ok: true })
  } catch (error) {
    console.error("Edit slip error:", error)
    return Response.json({ error: "Failed to update slip" }, { status: 500 })
  }
}

/**
 * Delete a payment slip. If it was approved (has a linked CustomerReceipt), the
 * receipt is deleted too — removing that credit from the party's ledger so the
 * balance reflects that the payment is gone. The blob image is purged as well.
 */
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModule("payments.slips", "write")
  if (auth instanceof Response) return auth

  try {
    const { id } = await params
    const slip = await prisma.paymentSlip.findUnique({
      where: { id },
      select: {
        id: true,
        customerId: true,
        imageUrl: true,
        imagePurgedAt: true,
        linkedReceiptId: true,
        linkedReceipt: { select: { receiptNo: true, amount: true } },
      },
    })
    if (!slip) return Response.json({ error: "Slip not found" }, { status: 404 })

    // Drop the slip first (it holds the FK to the receipt), then the receipt —
    // so the credit disappears from the customer's ledger.
    await prisma.$transaction(async (tx) => {
      await tx.paymentSlip.delete({ where: { id } })
      if (slip.linkedReceiptId) {
        await tx.customerReceipt.delete({ where: { id: slip.linkedReceiptId } })
      }
    })

    if (slip.imageUrl && !slip.imagePurgedAt) await deleteBlob(slip.imageUrl)

    await writeAuditLog({
      userId: auth.session.userId,
      action: "DELETE",
      entity: "PaymentSlip",
      entityId: id,
      changes: {
        customerId: slip.customerId,
        receiptNo: slip.linkedReceipt?.receiptNo ?? null,
        amount: slip.linkedReceipt?.amount ?? null,
      },
    })

    return Response.json({ ok: true })
  } catch (error) {
    console.error("Delete slip error:", error)
    return Response.json({ error: "Failed to delete slip" }, { status: 500 })
  }
}
