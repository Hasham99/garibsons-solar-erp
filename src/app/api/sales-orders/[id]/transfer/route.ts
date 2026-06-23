import { prisma } from "@/lib/prisma"
import { requireModule } from "@/lib/permissions/guard"

/**
 * Reassign a Sales Order to a different customer ("change party").
 *
 * Fixes mis-attributed orders — e.g. bulk-import typos that created two
 * customer records for the same party. Safe at ANY status because:
 *   - it never touches stock movements (those are tied to warehouses/stock
 *     entries, not the customer), so reservations/dispatches are unaffected;
 *   - the customer balance is derived (SUM(SO.grandTotal) − receipts), so both
 *     the old and new customer balances self-correct once the SO moves.
 *
 * A DO has no customer of its own (it inherits the party from its SO), so all
 * of this SO's delivery orders follow automatically. Any invoices and ledger
 * rows that belong to this SO are repointed too, so the party stays consistent.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireModule("sales", "write")
    if (auth instanceof Response) return auth

    const { id } = await params
    const { customerId } = await request.json()

    if (!customerId || typeof customerId !== "string") {
      return Response.json({ error: "A destination customer is required" }, { status: 400 })
    }

    const so = await prisma.salesOrder.findUnique({
      where: { id },
      select: { id: true, soNumber: true, customerId: true },
    })
    if (!so) return Response.json({ error: "Sales order not found" }, { status: 404 })

    if (so.customerId === customerId) {
      return Response.json({ error: "Sales order already belongs to that customer" }, { status: 422 })
    }

    const target = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, name: true },
    })
    if (!target) return Response.json({ error: "Destination customer not found" }, { status: 404 })

    await prisma.$transaction([
      prisma.salesOrder.update({ where: { id }, data: { customerId } }),
      // Keep any invoices and ledger rows for this SO pointed at the same party.
      prisma.invoice.updateMany({ where: { soId: id }, data: { customerId } }),
      prisma.partyLedger.updateMany({ where: { soId: id }, data: { customerId } }),
    ])

    return Response.json({ ok: true, soNumber: so.soNumber, customerName: target.name })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to transfer sales order" }, { status: 500 })
  }
}
