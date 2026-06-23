import { prisma } from "@/lib/prisma"
import { requireModule } from "@/lib/permissions/guard"
import { writeAuditLog } from "@/lib/audit"

/**
 * Mark a slip as a duplicate that was already received — does NOT create a
 * CustomerReceipt (so the party's collection is untouched). Used when the
 * duplicate check during validation finds the payment already exists.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModule("payments.slips", "write")
  if (auth instanceof Response) return auth

  try {
    const { id } = await params
    const slip = await prisma.paymentSlip.findUnique({ where: { id } })
    if (!slip) return Response.json({ error: "Slip not found" }, { status: 404 })
    if (slip.linkedReceiptId) {
      return Response.json({ error: "This slip is already recorded as a receipt" }, { status: 409 })
    }

    const { receiptNo } = await request.json().catch(() => ({ receiptNo: null }))
    const note = receiptNo ? `Already received — ${receiptNo}` : "Already received"

    await prisma.paymentSlip.update({
      where: { id },
      data: {
        status: "ALREADY_RECEIVED",
        reviewedById: auth.session.userId || null,
        reviewedAt: new Date(),
        rejectionReason: note,
      },
    })

    await writeAuditLog({
      userId: auth.session.userId,
      action: "UPDATE",
      entity: "PaymentSlip",
      entityId: id,
      changes: { status: "ALREADY_RECEIVED", note },
    })

    return Response.json({ ok: true })
  } catch (error) {
    console.error("Mark already-received error:", error)
    return Response.json({ error: "Failed to update slip" }, { status: 500 })
  }
}
