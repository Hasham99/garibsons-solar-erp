import { prisma } from "@/lib/prisma"
import { requireModule } from "@/lib/permissions/guard"
import { writeAuditLog } from "@/lib/audit"
import { getNextRef } from "@/lib/counter"
import { normalizeReferenceKey } from "@/lib/collections/reference"
import { findDuplicateReceipts } from "@/lib/collections/duplicate"

/**
 * Validate a submitted slip: staff enter the confirmed receipt details, the
 * system runs warn-and-confirm duplicate detection, then a CustomerReceipt is
 * created and linked, and the slip is marked VERIFIED.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModule("payments.slips", "write")
  if (auth instanceof Response) return auth

  try {
    const { id } = await params
    const slip = await prisma.paymentSlip.findUnique({ where: { id } })
    if (!slip) return Response.json({ error: "Slip not found" }, { status: 404 })
    if (slip.status === "VERIFIED") {
      return Response.json({ error: "Slip already verified" }, { status: 409 })
    }

    const { bankId, amount, reference, valueDate, notes, confirmDuplicate } = await request.json()
    if (!bankId || !amount || !valueDate) {
      return Response.json({ error: "bankId, amount, and valueDate are required" }, { status: 400 })
    }
    const parsedAmount = parseFloat(amount)
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return Response.json({ error: "Amount must be a positive number" }, { status: 400 })
    }

    if (!confirmDuplicate) {
      const dup = await findDuplicateReceipts(bankId, reference, parsedAmount)
      if (dup.matches.length > 0) {
        return Response.json({ duplicateWarning: dup }, { status: 409 })
      }
    }

    const receiptNo = await getNextRef("RCP", "RCP", { includeYear: true, padStart: 4 })

    // Create the receipt and link the slip atomically.
    const receipt = await prisma.$transaction(async (tx) => {
      const r = await tx.customerReceipt.create({
        data: {
          receiptNo,
          customerId: slip.customerId,
          bankId,
          amount: parsedAmount,
          reference: reference || null,
          referenceKey: normalizeReferenceKey(reference),
          valueDate: new Date(valueDate),
          notes: notes || null,
          createdById: auth.session.userId || null,
        },
        include: { bank: { select: { name: true } } },
      })
      await tx.paymentSlip.update({
        where: { id },
        data: {
          status: "VERIFIED",
          reviewedById: auth.session.userId || null,
          reviewedAt: new Date(),
          rejectionReason: null,
          linkedReceiptId: r.id,
          // Mirror the staff-confirmed amount/date onto the party-facing claimed
          // values, so a customer who mistyped sees the corrected figures.
          claimedAmount: parsedAmount,
          claimedValueDate: new Date(valueDate),
        },
      })
      return r
    })

    await writeAuditLog({
      userId: auth.session.userId,
      action: "UPDATE",
      entity: "PaymentSlip",
      entityId: id,
      changes: { status: "VERIFIED", receiptNo, amount: parsedAmount },
    })

    return Response.json({ receipt })
  } catch (error) {
    console.error("Verify slip error:", error)
    return Response.json({ error: "Failed to verify slip" }, { status: 500 })
  }
}
