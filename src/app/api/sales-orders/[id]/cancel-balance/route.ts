import { prisma } from "@/lib/prisma"
import { writeAuditLog } from "@/lib/audit"
import { requireModule } from "@/lib/permissions/guard"
import { recomputeSoStatus, soRemainingPanels } from "@/lib/delivery"

/**
 * Cancel the undelivered/uncommitted balance of a sales order — i.e. close the
 * panels that have no delivery order yet, keeping them on record. Used when a
 * customer won't take the remainder after a partial delivery.
 *
 * Body (optional): { reason }
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await requireModule("sales", "write")
    if (auth instanceof Response) return auth
    const session = auth.session

    let body: { reason?: string } = {}
    try {
      body = await request.json()
    } catch {
      body = {}
    }

    const updated = await prisma.$transaction(async (tx) => {
      const so = await tx.salesOrder.findUnique({
        where: { id },
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
      if (!so) throw new Error("NOT_FOUND")
      if (["CANCELLED", "INVOICED", "DRAFT", "PENDING_PAYMENT"].includes(so.status)) throw new Error("BAD_STATE")

      const deliveryOrders = so.deliveryOrders as unknown as Parameters<typeof soRemainingPanels>[1]
      const remaining = soRemainingPanels(so.lines, deliveryOrders, so.balanceCancelledQty)
      if (remaining <= 0) throw new Error("NO_BALANCE")

      const newBalanceCancelled = so.balanceCancelledQty + remaining
      const nextStatus = recomputeSoStatus({
        lines: so.lines,
        deliveryOrders: so.deliveryOrders as unknown as Parameters<typeof recomputeSoStatus>[0]["deliveryOrders"],
        balanceCancelledQty: newBalanceCancelled,
        currentStatus: so.status,
      })

      const result = await tx.salesOrder.update({
        where: { id },
        data: {
          balanceCancelledQty: newBalanceCancelled,
          balanceCancelledAt: new Date(),
          balanceCancelledBy: session.name,
          balanceCancelReason: body.reason?.trim() || null,
          ...(nextStatus && nextStatus !== so.status ? { status: nextStatus as never } : {}),
        },
        select: { id: true, soNumber: true, status: true, balanceCancelledQty: true },
      })
      return { result, remaining }
    })

    await writeAuditLog({
      userId: session.userId,
      action: "CANCEL_SO_BALANCE",
      entity: "SalesOrder",
      entityId: id,
      changes: { cancelledPanels: updated.remaining, reason: body.reason ?? null },
    })

    return Response.json({ ...updated.result, cancelledPanels: updated.remaining })
  } catch (error) {
    if (error instanceof Error) {
      const map: Record<string, [string, number]> = {
        NOT_FOUND: ["Sales order not found", 404],
        BAD_STATE: ["This sales order's balance can't be cancelled in its current state", 400],
        NO_BALANCE: ["There is no undelivered balance to cancel", 422],
      }
      const hit = map[error.message]
      if (hit) return Response.json({ error: hit[0] }, { status: hit[1] })
    }
    console.error(error)
    return Response.json({ error: "Failed to cancel sales order balance" }, { status: 500 })
  }
}
