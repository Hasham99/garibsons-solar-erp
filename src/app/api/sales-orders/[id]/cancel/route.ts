import { prisma } from "@/lib/prisma"
import { writeAuditLog } from "@/lib/audit"
import { getSession } from "@/lib/auth"
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
    const session = await getSession()

    if (!session.isLoggedIn) {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (!["ADMIN", "SALES", "ACCOUNTS"].includes(session.role || "")) {
      return Response.json({ error: "Only admin, sales, or accounts can cancel sales orders" }, { status: 403 })
    }

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

      const dispatched = salesOrder.deliveryOrders.filter((d) => d.status === "DISPATCHED")
      if (dispatched.length) {
        throw new Error(`DISPATCHED:${dispatched.map((d) => d.doNumber).join(", ")}`)
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
          { error: `Cannot cancel — delivery order(s) already dispatched: ${error.message.slice("DISPATCHED:".length)}` },
          { status: 422 }
        )
      }
    }
    console.error(error)
    return Response.json({ error: "Failed to cancel sales order" }, { status: 500 })
  }
}
