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

    if (!["ADMIN", "WAREHOUSE"].includes(session.role || "")) {
      return Response.json({ error: "Only admin or warehouse can dispatch delivery orders" }, { status: 403 })
    }

    const updated = await prisma.$transaction(async (tx) => {
      const deliveryOrder = await tx.deliveryOrder.findUnique({
        where: { id },
        include: {
          salesOrder: {
            include: { customer: true },
          },
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

      if (deliveryOrder.status !== "AUTHORIZED") {
        throw new Error("NOT_AUTHORIZED")
      }

      const outstandingReservations = getOutstandingReservations(deliveryOrder.stockMovements)
      if (!outstandingReservations.length) {
        throw new Error("NO_RESERVATIONS")
      }

      await tx.stockMovement.createMany({
        data: outstandingReservations.map((reservation) => ({
          stockEntryId: reservation.stockEntryId,
          type: "STOCK_OUT",
          quantity: reservation.quantity,
          watts: reservation.watts,
          soId: deliveryOrder.soId,
          doId: deliveryOrder.id,
          userId: session.userId || null,
          reason: `Dispatched via DO ${deliveryOrder.doNumber}`,
        })),
      })

      const dispatchedOrder = await tx.deliveryOrder.update({
        where: { id },
        data: {
          status: "DISPATCHED",
          dispatchedAt: new Date(),
        },
      })

      await tx.salesOrder.update({
        where: { id: deliveryOrder.soId },
        data: { status: "DELIVERED" },
      })

      // Auto-book customer ledger debit for this delivery
      const customer = deliveryOrder.salesOrder?.customer
      if (customer) {
        const lastEntry = await tx.partyLedger.findFirst({
          where: { customerId: customer.id },
          orderBy: { date: "desc" },
          select: { balance: true },
        })
        const prevBalance = lastEntry?.balance ?? 0
        const debitAmount = deliveryOrder.salesOrder.grandTotal
        await tx.partyLedger.create({
          data: {
            customerId: customer.id,
            date: new Date(),
            description: `DO Dispatched — ${deliveryOrder.doNumber} (${deliveryOrder.salesOrder.soNumber})`,
            debit: debitAmount,
            credit: 0,
            balance: prevBalance + debitAmount,
            soId: deliveryOrder.soId,
          },
        })
      }

      return { dispatchedOrder, outstandingReservations }
    })

    await writeAuditLog({
      userId: session.userId,
      action: "DISPATCH",
      entity: "DeliveryOrder",
      entityId: id,
      changes: {
        reservedBatches: updated.outstandingReservations.length,
        quantity: updated.outstandingReservations.reduce((total, item) => total + item.quantity, 0),
        watts: updated.outstandingReservations.reduce((total, item) => total + item.watts, 0),
      },
    })

    return Response.json(updated.dispatchedOrder)
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return Response.json({ error: "Not found" }, { status: 404 })
      }
      if (error.message === "NOT_AUTHORIZED") {
        return Response.json({ error: "Delivery order must be authorized before dispatch" }, { status: 400 })
      }
      if (error.message === "NO_RESERVATIONS") {
        return Response.json({ error: "No outstanding reservation found for this delivery order" }, { status: 422 })
      }
    }

    console.error(error)
    return Response.json({ error: "Failed to dispatch delivery order" }, { status: 500 })
  }
}
