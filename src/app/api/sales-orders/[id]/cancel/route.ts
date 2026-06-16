import { prisma } from "@/lib/prisma"
import { writeAuditLog } from "@/lib/audit"
import { requireModule } from "@/lib/permissions/guard"
import { getOutstandingReservations } from "@/lib/stock"

/**
 * Cancels a sales order and cascades to its delivery orders:
 * every non-cancelled DO is cancelled and its outstanding stock
 * reservations are released. Dispatched DOs block the cancellation
 * because their stock has already physically left the warehouse.
 */
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await requireModule("sales", "write")
    if (auth instanceof Response) return auth
    const session = auth.session

    const result = await prisma.$transaction(async (tx) => {
      const salesOrder = await tx.salesOrder.findUnique({
        where: { id },
        include: {
          deliveryOrders: {
            include: {
              stockMovements: {
                where: { type: { in: ["RESERVATION", "RELEASE", "STOCK_OUT"] } },
                select: { type: true, quantity: true, watts: true, stockEntryId: true },
              },
            },
          },
        },
      })

      if (!salesOrder) throw new Error("NOT_FOUND")
      if (salesOrder.status === "CANCELLED") return { salesOrder, cancelledDOs: [] as string[] }

      // Once any DO has been lifted (fully or partially), the SO can't be voided —
      // use "Cancel SO Balance" to close the undelivered remainder instead.
      const lifted = salesOrder.deliveryOrders.filter((d) =>
        ["DISPATCHED", "PARTIALLY_DISPATCHED"].includes(d.status)
      )
      if (lifted.length) {
        throw new Error(`DISPATCHED:${lifted.map((d) => d.doNumber).join(", ")}`)
      }

      const activeDOs = salesOrder.deliveryOrders.filter((d) => d.status !== "CANCELLED")
      for (const deliveryOrder of activeDOs) {
        const outstanding = getOutstandingReservations(deliveryOrder.stockMovements)
        if (outstanding.length) {
          await tx.stockMovement.createMany({
            data: outstanding.map((reservation) => ({
              stockEntryId: reservation.stockEntryId,
              type: "RELEASE",
              quantity: reservation.quantity,
              watts: reservation.watts,
              soId: salesOrder.id,
              doId: deliveryOrder.id,
              userId: session.userId || null,
              reason: `Released from ${deliveryOrder.doNumber} — SO ${salesOrder.soNumber} cancelled`,
            })),
          })
        }
        await tx.deliveryOrder.update({ where: { id: deliveryOrder.id }, data: { status: "CANCELLED" } })
      }

      const updated = await tx.salesOrder.update({ where: { id }, data: { status: "CANCELLED" } })
      return { salesOrder: updated, cancelledDOs: activeDOs.map((d) => d.doNumber) }
    })

    await writeAuditLog({
      userId: session.userId,
      action: "CANCEL",
      entity: "SalesOrder",
      entityId: id,
      changes: { status: "CANCELLED", cascadedDOs: result.cancelledDOs },
    })

    return Response.json({ ...result.salesOrder, cancelledDOs: result.cancelledDOs })
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return Response.json({ error: "Sales order not found" }, { status: 404 })
      }
      if (error.message.startsWith("DISPATCHED:")) {
        return Response.json(
          {
            error: `Cannot cancel — stock already lifted on delivery order(s): ${error.message.slice(
              "DISPATCHED:".length
            )}. Use "Cancel SO Balance" to close the undelivered remainder.`,
          },
          { status: 422 }
        )
      }
    }
    console.error(error)
    return Response.json({ error: "Failed to cancel sales order" }, { status: 500 })
  }
}
