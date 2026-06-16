import { prisma } from "@/lib/prisma"
import { writeAuditLog } from "@/lib/audit"
import { requireModule } from "@/lib/permissions/guard"
import { getOutstandingReservations } from "@/lib/stock"
import { liftedPanels, recomputeSoStatus, reservedPanels, type MovementRow } from "@/lib/delivery"

/**
 * Cancel a delivery order, or cancel the un-lifted balance of a partially
 * dispatched one. One endpoint, behaviour depends on how much was lifted:
 *
 *   - nothing lifted (PENDING / AUTHORIZED)  → DO becomes CANCELLED, all reserved stock released.
 *   - partially lifted (PARTIALLY_DISPATCHED) → balance released, DO settles to DISPATCHED
 *       (delivered = lifted; the abandoned balance returns to the SO's remaining).
 *   - fully lifted (DISPATCHED)              → rejected (stock already gone).
 */
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await requireModule("delivery", "write")
    if (auth instanceof Response) return auth
    const session = auth.session

    const result = await prisma.$transaction(async (tx) => {
      const deliveryOrder = await tx.deliveryOrder.findUnique({
        where: { id },
        include: {
          stockMovements: {
            where: { type: { in: ["RESERVATION", "RELEASE", "STOCK_OUT"] } },
            select: { type: true, quantity: true, watts: true, stockEntryId: true },
          },
        },
      })

      if (!deliveryOrder) throw new Error("NOT_FOUND")
      if (deliveryOrder.status === "CANCELLED") return { order: deliveryOrder, settled: false }
      if (deliveryOrder.status === "DISPATCHED") throw new Error("ALREADY_DISPATCHED")

      const movements = deliveryOrder.stockMovements as MovementRow[]
      const lifted = liftedPanels(movements)
      const balance = reservedPanels(movements)
      const outstanding = getOutstandingReservations(movements)

      // Release whatever is still reserved.
      if (outstanding.length) {
        await tx.stockMovement.createMany({
          data: outstanding.map((r) => ({
            stockEntryId: r.stockEntryId,
            type: "RELEASE" as const,
            quantity: r.quantity,
            watts: r.watts,
            soId: deliveryOrder.soId,
            doId: deliveryOrder.id,
            userId: session.userId || null,
            reason:
              lifted > 0
                ? `Balance (${balance}) cancelled on DO ${deliveryOrder.doNumber}`
                : `Released from cancelled DO ${deliveryOrder.doNumber}`,
          })),
        })
      }

      // Nothing lifted → cancel outright; partially lifted → settle as dispatched.
      const newStatus = lifted > 0 ? "DISPATCHED" : "CANCELLED"
      const updatedOrder = await tx.deliveryOrder.update({
        where: { id },
        data: { status: newStatus, dispatchedAt: lifted > 0 ? new Date() : deliveryOrder.dispatchedAt },
      })

      // Recompute the parent SO status from fresh data.
      const so = await tx.salesOrder.findUnique({
        where: { id: deliveryOrder.soId },
        include: {
          lines: { select: { quantity: true } },
          deliveryOrders: {
            select: {
              status: true,
              quantity: true,
              stockMovements: { select: { type: true, quantity: true, watts: true, stockEntryId: true } },
            },
          },
        },
      })
      if (so) {
        const next = recomputeSoStatus({
          lines: so.lines,
          deliveryOrders: so.deliveryOrders as unknown as Parameters<typeof recomputeSoStatus>[0]["deliveryOrders"],
          balanceCancelledQty: so.balanceCancelledQty,
          currentStatus: so.status,
        })
        if (next && next !== so.status) {
          await tx.salesOrder.update({ where: { id: so.id }, data: { status: next as never } })
        }
      }

      return { order: updatedOrder, settled: lifted > 0, lifted, balance }
    })

    await writeAuditLog({
      userId: session.userId,
      action: result.settled ? "CANCEL_BALANCE" : "CANCEL",
      entity: "DeliveryOrder",
      entityId: id,
      changes: { settled: result.settled, lifted: result.lifted ?? 0, balanceCancelled: result.balance ?? 0 },
    })

    return Response.json(result.order)
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") return Response.json({ error: "Not found" }, { status: 404 })
      if (error.message === "ALREADY_DISPATCHED") {
        return Response.json({ error: "Dispatched delivery orders cannot be cancelled" }, { status: 400 })
      }
    }
    console.error(error)
    return Response.json({ error: "Failed to cancel delivery order" }, { status: 500 })
  }
}
