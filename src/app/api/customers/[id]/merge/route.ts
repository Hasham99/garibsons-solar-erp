import { prisma } from "@/lib/prisma"
import { requireModule } from "@/lib/permissions/guard"

/**
 * Merge a duplicate customer into the correct one.
 *
 * Bulk import created near-identical parties from typos (e.g. "Zareef" vs
 * "Zareef Khan"). This moves EVERY record that points at the source customer
 * over to the target, then deactivates the now-empty source (kept for audit).
 *
 * Delivery orders are not listed below because they have no customerId of their
 * own — they inherit the party from their sales order, so moving the SOs carries
 * the DOs along. Customer balance is derived, so balances self-correct.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireModule("masters.customers", "write")
    if (auth instanceof Response) return auth

    const { id: sourceId } = await params
    const { targetCustomerId } = await request.json()

    if (!targetCustomerId || typeof targetCustomerId !== "string") {
      return Response.json({ error: "A destination customer is required" }, { status: 400 })
    }
    if (targetCustomerId === sourceId) {
      return Response.json({ error: "Cannot merge a customer into itself" }, { status: 422 })
    }

    const [source, target] = await Promise.all([
      prisma.customer.findUnique({ where: { id: sourceId }, select: { id: true, name: true } }),
      prisma.customer.findUnique({ where: { id: targetCustomerId }, select: { id: true, name: true } }),
    ])
    if (!source) return Response.json({ error: "Source customer not found" }, { status: 404 })
    if (!target) return Response.json({ error: "Destination customer not found" }, { status: 404 })

    const from = { where: { customerId: sourceId }, data: { customerId: targetCustomerId } }

    const [salesOrders, quotations, receipts, contacts, portalUsers, paymentSlips, invoices, ledgerEntries] =
      await prisma.$transaction([
        prisma.salesOrder.updateMany(from),
        prisma.quotation.updateMany(from),
        prisma.customerReceipt.updateMany(from),
        prisma.customerContact.updateMany(from),
        prisma.customerUser.updateMany(from),
        prisma.paymentSlip.updateMany(from),
        prisma.invoice.updateMany(from),
        prisma.partyLedger.updateMany(from),
        // Empty shell stays in the DB for audit, hidden from pickers/lists.
        prisma.customer.update({ where: { id: sourceId }, data: { active: false } }),
      ])

    return Response.json({
      ok: true,
      sourceName: source.name,
      targetName: target.name,
      moved: {
        salesOrders: salesOrders.count,
        quotations: quotations.count,
        receipts: receipts.count,
        contacts: contacts.count,
        portalUsers: portalUsers.count,
        paymentSlips: paymentSlips.count,
        invoices: invoices.count,
        ledgerEntries: ledgerEntries.count,
      },
    })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to merge customer" }, { status: 500 })
  }
}
