import { prisma } from "@/lib/prisma"
import { requireModule } from "@/lib/permissions/guard"
import { writeAuditLog } from "@/lib/audit"

/** Deletes a batch of collection receipts (party ledger / receipts checkboxes). */
export async function POST(request: Request) {
  try {
    const auth = await requireModule("ledger", "write")
    if (auth instanceof Response) return auth
    const session = auth.session

    const { ids } = await request.json()
    if (!Array.isArray(ids) || ids.length === 0) {
      return Response.json({ error: "ids array is required" }, { status: 400 })
    }

    const receipts = await prisma.customerReceipt.findMany({
      where: { id: { in: ids } },
      select: { id: true, receiptNo: true, amount: true, customerId: true },
    })
    if (receipts.length === 0) return Response.json({ error: "No matching receipts found" }, { status: 404 })

    const { count } = await prisma.customerReceipt.deleteMany({ where: { id: { in: receipts.map((r) => r.id) } } })

    await writeAuditLog({
      userId: session.userId,
      action: "DELETE",
      entity: "CustomerReceipt",
      entityId: receipts.map((r) => r.receiptNo).join(","),
      changes: { count, totalAmount: receipts.reduce((s, r) => s + r.amount, 0) },
    })

    return Response.json({ ok: true, deleted: count })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to delete collections" }, { status: 500 })
  }
}
