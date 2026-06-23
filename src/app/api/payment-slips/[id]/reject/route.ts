import { prisma } from "@/lib/prisma"
import { requireModule } from "@/lib/permissions/guard"
import { writeAuditLog } from "@/lib/audit"

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModule("payments.slips", "write")
  if (auth instanceof Response) return auth

  try {
    const { id } = await params
    const slip = await prisma.paymentSlip.findUnique({ where: { id } })
    if (!slip) return Response.json({ error: "Slip not found" }, { status: 404 })
    if (slip.linkedReceiptId) {
      return Response.json({ error: "Cannot reject a slip that has been recorded as a receipt" }, { status: 409 })
    }

    const { reason } = await request.json()

    const updated = await prisma.paymentSlip.update({
      where: { id },
      data: {
        status: "REJECTED",
        reviewedById: auth.session.userId || null,
        reviewedAt: new Date(),
        rejectionReason: (reason && String(reason).trim()) || null,
      },
    })

    await writeAuditLog({
      userId: auth.session.userId,
      action: "UPDATE",
      entity: "PaymentSlip",
      entityId: id,
      changes: { status: "REJECTED", reason: updated.rejectionReason },
    })

    return Response.json({ ok: true })
  } catch (error) {
    console.error("Reject slip error:", error)
    return Response.json({ error: "Failed to reject slip" }, { status: 500 })
  }
}
