import { prisma } from "@/lib/prisma"
import { getNextRef } from "@/lib/counter"
import { getSession } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"
import { buildReservationPlan, getOutstandingReservations } from "@/lib/stock"

class DeliveryOrderError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

export async function GET() {
  try {
    const dos = await prisma.deliveryOrder.findMany({
      include: {
        salesOrder: {
          include: {
            customer: true,
            lines: { include: { product: true } },
          },
        },
        warehouse: true,
        createdBy: { select: { name: true } },
        stockMovements: {
          select: { type: true, quantity: true, watts: true, stockEntryId: true },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    const now = Date.now()
    return Response.json(
      dos.map((deliveryOrder) => {
        const outstandingReservations = getOutstandingReservations(deliveryOrder.stockMovements)
        const agingDays = Math.max(0, Math.floor((now - deliveryOrder.createdAt.getTime()) / (1000 * 60 * 60 * 24)))
        return {
          ...deliveryOrder,
          reservedQuantity: outstandingReservations.reduce((t, i) => t + i.quantity, 0),
          reservedWatts: outstandingReservations.reduce((t, i) => t + i.watts, 0),
          reservedBatches: outstandingReservations.length,
          agingDays,
        }
      })
    )
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to fetch delivery orders" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const data = await request.json()
    const session = await getSession()

    if (!session.isLoggedIn) return Response.json({ error: "Unauthorized" }, { status: 401 })
    if (!["ADMIN", "WAREHOUSE", "SALES"].includes(session.role || "")) {
      return Response.json({ error: "Only admin, warehouse, or sales can create delivery orders" }, { status: 403 })
    }
    if (!data.soId || !data.warehouseId) {
      return Response.json({ error: "Sales order and warehouse are required" }, { status: 400 })
    }

    const doNumber = await getNextRef("SOL-DO", "SOL-DO", { includeYear: false, padStart: 4 })

    const deliveryOrder = await prisma.$transaction(async (tx) => {
      const salesOrder = await tx.salesOrder.findUnique({
        where: { id: data.soId },
        include: {
          customer: true,
          deliveryOrders: {
            include: { stockMovements: { select: { type: true, quantity: true, watts: true, stockEntryId: true } } },
          },
          lines: { include: { product: true } },
        },
      })

      if (!salesOrder) throw new DeliveryOrderError("Sales order not found", 404)
      if (!["PAYMENT_CONFIRMED", "DO_ISSUED"].includes(salesOrder.status)) {
        throw new DeliveryOrderError("Delivery order can only be created after payment is confirmed", 422)
      }
      if (!salesOrder.lines.length) throw new DeliveryOrderError("Sales order has no line items to dispatch", 422)

      // Calculate how many panels are already covered by active/completed DOs
      const soTotalPanels = salesOrder.lines.reduce((s, l) => s + l.quantity, 0)
      const alreadyDispatched = salesOrder.deliveryOrders
        .filter((d) => d.status !== "CANCELLED")
        .reduce((s, d) => s + d.quantity, 0)
      const remaining = soTotalPanels - alreadyDispatched

      if (remaining <= 0) throw new DeliveryOrderError("All panels for this sales order have already been covered by delivery orders", 409)

      // Partial quantity: user can specify fewer panels than remaining
      const requestedPanels = data.quantity ? parseInt(data.quantity) : remaining
      if (requestedPanels <= 0) throw new DeliveryOrderError("Quantity must be greater than 0", 400)
      if (requestedPanels > remaining) {
        throw new DeliveryOrderError(`Requested ${requestedPanels} panels but only ${remaining} remain undelivered`, 422)
      }

      // Scale order lines proportionally for partial delivery
      // We build a scaled set of line items that sum to requestedPanels
      const scaledLines = buildScaledLines(salesOrder.lines, requestedPanels, soTotalPanels)

      const productIds = Array.from(new Set(scaledLines.map((l) => l.productId)))
      const stockEntries = await tx.stockEntry.findMany({
        where: { warehouseId: data.warehouseId, productId: { in: productIds } },
        include: { movements: { select: { type: true, quantity: true, watts: true, stockEntryId: true } } },
        orderBy: [{ receivedAt: "asc" }, { createdAt: "asc" }],
      })

      const reservationPlan = buildReservationPlan({
        stockEntries,
        orderLines: scaledLines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
          watts: line.watts,
          wattage: line.product.wattage,
        })),
      })

      if (reservationPlan.shortages.length > 0) {
        const shortageDetails = reservationPlan.shortages
          .map((s) => {
            const name = scaledLines.find((l) => l.productId === s.productId)?.product.name || "Unknown"
            return `${name}: requested ${s.requestedQuantity}, available ${s.availableQuantity}`
          })
          .join("; ")
        throw new DeliveryOrderError(`Insufficient available stock. ${shortageDetails}`, 422)
      }

      const quantity = scaledLines.reduce((s, l) => s + l.quantity, 0)
      const watts = scaledLines.reduce((s, l) => s + l.watts, 0)

      const createdOrder = await tx.deliveryOrder.create({
        data: {
          doNumber,
          soId: salesOrder.id,
          warehouseId: data.warehouseId,
          quantity,
          watts,
          status: "PENDING",
          notes: data.notes,
          validityDays: data.validityDays ? parseInt(data.validityDays) : 3,
          createdById: session.userId || null,
          lines: data.lines?.length
            ? {
                create: data.lines
                  .filter((l: { quantity: number }) => l.quantity > 0)
                  .map((l: { soLineId?: string; productId: string; quantity: number; watts: number }) => ({
                    soLineId: l.soLineId || null,
                    productId: l.productId,
                    quantity: l.quantity,
                    watts: l.watts,
                  })),
              }
            : undefined,
        },
        include: {
          salesOrder: { include: { customer: true, lines: { include: { product: true } } } },
          warehouse: true,
          lines: { include: { product: true } },
        },
      })

      await tx.stockMovement.createMany({
        data: reservationPlan.allocations.map((allocation) => ({
          stockEntryId: allocation.stockEntryId,
          type: "RESERVATION",
          quantity: allocation.quantity,
          watts: allocation.watts,
          soId: salesOrder.id,
          doId: createdOrder.id,
          userId: session.userId || null,
          reason: `Reserved for ${doNumber}`,
        })),
      })

      // Mark SO as DO_ISSUED (stays there until all panels delivered)
      await tx.salesOrder.update({ where: { id: salesOrder.id }, data: { status: "DO_ISSUED" } })

      return createdOrder
    })

    await writeAuditLog({
      userId: session.userId,
      action: "CREATE",
      entity: "DeliveryOrder",
      entityId: deliveryOrder.id,
      changes: { doNumber, soId: data.soId, warehouseId: data.warehouseId, quantity: deliveryOrder.quantity },
    })

    return Response.json(deliveryOrder, { status: 201 })
  } catch (error) {
    if (error instanceof DeliveryOrderError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    console.error(error)
    return Response.json({ error: "Failed to create delivery order" }, { status: 500 })
  }
}

// Distribute requestedPanels across SO lines proportionally
function buildScaledLines(
  lines: Array<{ productId: string; quantity: number; watts: number; product: { wattage: number; name: string } }>,
  requestedPanels: number,
  totalPanels: number,
) {
  if (requestedPanels === totalPanels) return lines

  let remaining = requestedPanels
  return lines.map((line, i) => {
    const isLast = i === lines.length - 1
    const scaled = isLast ? remaining : Math.round((line.quantity / totalPanels) * requestedPanels)
    remaining -= scaled
    return {
      ...line,
      quantity: scaled,
      watts: scaled * line.product.wattage,
    }
  })
}
