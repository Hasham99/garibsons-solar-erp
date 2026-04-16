import { prisma } from "@/lib/prisma"
import { writeAuditLog } from "@/lib/audit"
import { getSession } from "@/lib/auth"
import { getOutstandingReservations } from "@/lib/stock"

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const session = await getSession()

    if (!session.isLoggedIn) {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!["ADMIN", "WAREHOUSE", "SALES"].includes(session.role || "")) {
      return Response.json({ error: "Only admin, warehouse, or sales can cancel delivery orders" }, { status: 403 })
    }

    const cancelledOrder = await prisma.$transaction(async (tx) => {
      const deliveryOrder = await tx.deliveryOrder.findUnique({
        where: { id },
        include: {
          stockMovements: {
            where: {
              type: { in: ["RESERVATION", "RELEASE", "STOCK_OUT"] },
            },
            select: {
              type: true,
              quantity: true,
              watts: true,
              stockEntryId: true,
            },
          },
        },
      })

      if (!deliveryOrder) {
        throw new Error("NOT_FOUND")
      }

      if (deliveryOrder.status === "DISPATCHED") {
        throw new Error("ALREADY_DISPATCHED")
      }

      if (deliveryOrder.status === "CANCELLED") {
        return deliveryOrder
      }

      const outstandingReservations = getOutstandingReservations(deliveryOrder.stockMovements)

      if (outstandingReservations.length) {
        await tx.stockMovement.createMany({
          data: outstandingReservations.map((reservation) => ({
            stockEntryId: reservation.stockEntryId,
            type: "RELEASE",
            quantity: reservation.quantity,
            watts: reservation.watts,
            soId: deliveryOrder.soId,
            doId: deliveryOrder.id,
            userId: session.userId || null,
            reason: `Released from cancelled DO ${deliveryOrder.doNumber}`,
          })),
        })
      }

      const updatedOrder = await tx.deliveryOrder.update({
        where: { id },
        data: {
          status: "CANCELLED",
        },
      })

      await tx.salesOrder.update({
        where: { id: deliveryOrder.soId },
        data: { status: "PAYMENT_CONFIRMED" },
      })

      return updatedOrder
    })

    await writeAuditLog({
      userId: session.userId,
      action: "CANCEL",
      entity: "DeliveryOrder",
      entityId: id,
      changes: { status: "CANCELLED" },
    })

    return Response.json(cancelledOrder)
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return Response.json({ error: "Not found" }, { status: 404 })
      }
      if (error.message === "ALREADY_DISPATCHED") {
        return Response.json({ error: "Dispatched delivery orders cannot be cancelled" }, { status: 400 })
      }
    }

    console.error(error)
    return Response.json({ error: "Failed to cancel delivery order" }, { status: 500 })
  }
}
