import { prisma } from "@/lib/prisma"
import { writeAuditLog } from "@/lib/audit"
import { requireModule } from "@/lib/permissions/guard"
import { getOutstandingReservations } from "@/lib/stock"
import { liftedPanels, planStockOut, recomputeSoStatus, type MovementRow } from "@/lib/delivery"

/**
 * Dispatch ("lift") a delivery order — fully or partially.
 *
 * Body (optional): { lines: [{ productId, quantity }] }
 *   - omit / empty → lift the entire outstanding balance (full dispatch)
 *   - provide per-product quantities → partial lift; the DO stays
 *     PARTIALLY_DISPATCHED until everything is lifted.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await requireModule("delivery", "write")
    if (auth instanceof Response) return auth
    const session = auth.session

    let body: { lines?: Array<{ productId: string; quantity: number | string }> } = {}
    try {
      body = await request.json()
    } catch {
      body = {}
    }

    const result = await prisma.$transaction(async (tx) => {
      const deliveryOrder = await tx.deliveryOrder.findUnique({
        where: { id },
        include: {
          stockMovements: {
            where: { type: { in: ["RESERVATION", "RELEASE", "STOCK_OUT"] } },
            include: { stockEntry: { select: { id: true, productId: true, receivedAt: true } } },
          },
        },
      })

      if (!deliveryOrder) throw new Error("NOT_FOUND")
      if (!["AUTHORIZED", "PARTIALLY_DISPATCHED"].includes(deliveryOrder.status)) {
        throw new Error("NOT_DISPATCHABLE")
      }

      const movements = deliveryOrder.stockMovements as unknown as MovementRow[]
      const outstanding = getOutstandingReservations(movements)
      if (!outstanding.length) throw new Error("NO_RESERVATIONS")

      // Map stock entry → product / received date for FIFO allocation.
      const entryProduct: Record<string, string> = {}
      const entryReceivedAt: Record<string, string | Date> = {}
      for (const m of deliveryOrder.stockMovements) {
        if (m.stockEntry) {
          entryProduct[m.stockEntry.id] = m.stockEntry.productId
          entryReceivedAt[m.stockEntry.id] = m.stockEntry.receivedAt
        }
      }

      // Determine how many panels to lift per product.
      const liftByProduct: Record<string, number> = {}
      if (Array.isArray(body.lines) && body.lines.length > 0) {
        for (const l of body.lines) {
          const qty = Math.max(0, Math.floor(Number(l.quantity) || 0))
          if (qty > 0) liftByProduct[l.productId] = (liftByProduct[l.productId] || 0) + qty
        }
      } else {
        // Full dispatch — lift the entire outstanding balance per product.
        for (const o of outstanding) {
          const p = entryProduct[o.stockEntryId]
          if (p) liftByProduct[p] = (liftByProduct[p] || 0) + o.quantity
        }
      }

      const totalLiftNow = Object.values(liftByProduct).reduce((s, q) => s + q, 0)
      if (totalLiftNow <= 0) throw new Error("NOTHING_TO_LIFT")

      const plan = planStockOut({ outstanding, entryProduct, entryReceivedAt, liftByProduct })
      if (plan.shortages.length > 0) throw new Error("OVER_LIFT")

      await tx.stockMovement.createMany({
        data: plan.rows.map((r) => ({
          stockEntryId: r.stockEntryId,
          type: "STOCK_OUT" as const,
          quantity: r.quantity,
          watts: r.watts,
          soId: deliveryOrder.soId,
          doId: deliveryOrder.id,
          userId: session.userId || null,
          reason: `Lifted via DO ${deliveryOrder.doNumber}`,
        })),
      })

      const newLifted = liftedPanels(movements) + totalLiftNow
      const fullyLifted = newLifted >= deliveryOrder.quantity

      const updatedDO = await tx.deliveryOrder.update({
        where: { id },
        data: {
          status: fullyLifted ? "DISPATCHED" : "PARTIALLY_DISPATCHED",
          dispatchedAt: fullyLifted ? new Date() : deliveryOrder.dispatchedAt,
        },
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

      let soDelivered = false
      if (so) {
        const next = recomputeSoStatus({
          lines: so.lines,
          deliveryOrders: so.deliveryOrders as unknown as Parameters<typeof recomputeSoStatus>[0]["deliveryOrders"],
          balanceCancelledQty: so.balanceCancelledQty,
          currentStatus: so.status,
        })
        if (next && next !== so.status) {
          await tx.salesOrder.update({ where: { id: so.id }, data: { status: next as never } })
          soDelivered = next === "DELIVERED" && so.status !== "DELIVERED"
        }

        // Book the customer ledger debit once, when the SO becomes fully delivered.
        if (soDelivered) {
          const lastEntry = await tx.partyLedger.findFirst({
            where: { customerId: so.customerId },
            orderBy: { date: "desc" },
            select: { balance: true },
          })
          const prevBalance = lastEntry?.balance ?? 0
          await tx.partyLedger.create({
            data: {
              customerId: so.customerId,
              date: new Date(),
              description: `SO Delivered — ${so.soNumber}`,
              debit: so.grandTotal,
              credit: 0,
              balance: prevBalance + so.grandTotal,
              soId: so.id,
            },
          })
        }
      }

      return { updatedDO, liftedNow: totalLiftNow, fullyLifted }
    })

    await writeAuditLog({
      userId: session.userId,
      action: result.fullyLifted ? "DISPATCH" : "PARTIAL_DISPATCH",
      entity: "DeliveryOrder",
      entityId: id,
      changes: { liftedPanels: result.liftedNow, fullyLifted: result.fullyLifted },
    })

    return Response.json(result.updatedDO)
  } catch (error) {
    if (error instanceof Error) {
      const map: Record<string, [string, number]> = {
        NOT_FOUND: ["Not found", 404],
        NOT_DISPATCHABLE: ["Only authorized or partially-dispatched delivery orders can be lifted", 400],
        NO_RESERVATIONS: ["No outstanding reservation to lift for this delivery order", 422],
        NOTHING_TO_LIFT: ["Enter at least 1 panel to lift", 400],
        OVER_LIFT: ["Cannot lift more than the outstanding balance", 422],
      }
      const hit = map[error.message]
      if (hit) return Response.json({ error: hit[0] }, { status: hit[1] })
    }
    console.error(error)
    return Response.json({ error: "Failed to dispatch delivery order" }, { status: 500 })
  }
}
