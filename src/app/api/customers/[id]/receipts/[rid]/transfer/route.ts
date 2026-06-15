import { prisma } from "@/lib/prisma"
import { requireModule } from "@/lib/permissions/guard"
import { writeAuditLog } from "@/lib/audit"

/** Transfers a collection receipt to another party (fixes wrong-party entries).
 *  The receipt keeps its number, amount, bank, and dates — only the party changes. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; rid: string }> }) {
  try {
    const auth = await requireModule("ledger", "write")
    if (auth instanceof Response) return auth
    const session = auth.session

    const { id, rid } = await params
    const { toCustomerId } = await request.json()
    if (!toCustomerId) return Response.json({ error: "Target party is required" }, { status: 400 })
    if (toCustomerId === id) return Response.json({ error: "Receipt already belongs to this party" }, { status: 422 })

    const [receipt, target] = await Promise.all([
      prisma.customerReceipt.findUnique({ where: { id: rid }, include: { customer: { select: { name: true } } } }),
      prisma.customer.findUnique({ where: { id: toCustomerId }, select: { id: true, name: true } }),
    ])
    if (!receipt || receipt.customerId !== id) return Response.json({ error: "Receipt not found for this party" }, { status: 404 })
    if (!target) return Response.json({ error: "Target party not found" }, { status: 404 })

    const updated = await prisma.customerReceipt.update({
      where: { id: rid },
      data: {
        customerId: target.id,
        notes: [receipt.notes, `Transferred from ${receipt.customer.name} by ${session.name || "user"}`]
          .filter(Boolean)
          .join(" · "),
      },
    })

    await writeAuditLog({
      userId: session.userId,
      action: "TRANSFER",
      entity: "CustomerReceipt",
      entityId: rid,
      changes: { receiptNo: receipt.receiptNo, amount: receipt.amount, from: receipt.customer.name, to: target.name },
    })

    return Response.json(updated)
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to transfer collection" }, { status: 500 })
  }
}
