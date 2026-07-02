import { prisma } from "@/lib/prisma"
import { requireModule } from "@/lib/permissions/guard"
import { writeAuditLog } from "@/lib/audit"
import { buildReservationPlan, getOutstandingReservations } from "@/lib/stock"
import { committedPanels, liftedPanels } from "@/lib/delivery"
import { computeReturnableLayers, returnableByProduct } from "@/lib/returns"

class DeliveryOrderError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const deliveryOrder = await prisma.deliveryOrder.findUnique({
      where: { id },
      include: {
        lines: {
          include: {
            product: {
              select: {
                name: true, code: true, wattage: true,
                panelsPerContainer: true, palletsPerContainer: true,
              },
            },
          },
        },
        salesOrder: {
          include: {
            customer: true,
            lines: {
              include: {
                product: {
                  select: {
                    name: true, code: true, wattage: true,
                    panelsPerContainer: true, palletsPerContainer: true,
                  },
                },
              },
            },
          },
        },
        warehouse: {
          include: { contacts: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] } },
        },
        // Lean select — we only need movement totals + each entry's product id
        // (for per-line lifted progress), not the full stock entry / product.
        stockMovements: {
          select: {
            type: true,
            quantity: true,
            watts: true,
            stockEntryId: true,
            stockEntry: { select: { productId: true } },
          },
        },
      },
    })
    if (!deliveryOrder) return Response.json({ error: "Not found" }, { status: 404 })

    const outstandingReservations = getOutstandingReservations(deliveryOrder.stockMovements)

    // Lifted panels per product (from STOCK_OUT movements) → per-line progress.
    const liftedByProduct: Record<string, number> = {}
    for (const m of deliveryOrder.stockMovements) {
      if (m.type === "STOCK_OUT" && m.stockEntry?.productId) {
        liftedByProduct[m.stockEntry.productId] = (liftedByProduct[m.stockEntry.productId] || 0) + m.quantity
      }
    }
    const lineProgress = deliveryOrder.lines.map((line) => {
      const lifted = Math.min(line.quantity, liftedByProduct[line.productId] || 0)
      return {
        productId: line.productId,
        productName: line.product?.name ?? "",
        wattage: line.product?.wattage ?? 0,
        ordered: line.quantity,
        lifted,
        balance: Math.max(0, line.quantity - lifted),
      }
    })

    // Returnable quantities per product (lifted − already returned), for the Return/Exchange modal.
    const returnedLines = await prisma.salesReturnLine.findMany({
      where: { salesReturn: { doId: id, status: "COMPLETED" } },
      select: { stockEntryId: true, quantity: true },
    })
    const returnedByEntry: Record<string, number> = {}
    for (const r of returnedLines) {
      if (r.stockEntryId) returnedByEntry[r.stockEntryId] = (returnedByEntry[r.stockEntryId] || 0) + r.quantity
    }
    const nameByProduct: Record<string, { name: string; wattage: number }> = {}
    for (const line of deliveryOrder.lines) {
      nameByProduct[line.productId] = { name: line.product?.name ?? "", wattage: line.product?.wattage ?? 0 }
    }
    // Default credit rate = the matched SO line's ratePerWatt (editable in the UI).
    const rateByProduct: Record<string, number> = {}
    for (const line of deliveryOrder.salesOrder?.lines ?? []) {
      if (!(line.productId in rateByProduct)) rateByProduct[line.productId] = line.ratePerWatt
    }
    const returnable = returnableByProduct(
      computeReturnableLayers(deliveryOrder.stockMovements, returnedByEntry)
    ).map((r) => ({
      ...r,
      productName: nameByProduct[r.productId]?.name ?? "",
      wattage: nameByProduct[r.productId]?.wattage ?? Math.round(r.wattsPerPanel),
      ratePerWatt: rateByProduct[r.productId] ?? 0,
    }))

    return Response.json({
      ...deliveryOrder,
      outstandingReservations,
      lineProgress,
      returnableByProduct: returnable,
      liftedQuantity: liftedPanels(deliveryOrder.stockMovements),
      balanceQuantity: outstandingReservations.reduce((t, r) => t + r.quantity, 0),
    })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to fetch delivery order" }, { status: 500 })
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireModule("delivery", "write")
    if (auth instanceof Response) return auth
    const session = auth.session

    const { id } = await params
    const data = await request.json()

    // Full edit: re-plans stock reservations (release old, reserve new)
    if (data.editLines) {
      const updated = await prisma.$transaction(async (tx) => {
        const existing = await tx.deliveryOrder.findUnique({
          where: { id },
          include: {
            stockMovements: {
              where: { type: { in: ["RESERVATION", "RELEASE", "STOCK_OUT"] } },
              select: { type: true, quantity: true, watts: true, stockEntryId: true },
            },
            salesOrder: {
              include: {
                lines: { include: { product: { select: { name: true, wattage: true } } } },
                deliveryOrders: {
                  select: {
                    id: true,
                    status: true,
                    quantity: true,
                    stockMovements: { select: { type: true, quantity: true, watts: true, stockEntryId: true } },
                  },
                },
              },
            },
          },
        })

        if (!existing) throw new DeliveryOrderError("Not found", 404)
        if (!["PENDING", "AUTHORIZED"].includes(existing.status)) {
          throw new DeliveryOrderError("Only pending or authorized delivery orders can be edited", 422)
        }

        const requestLines: Array<{ soLineId?: string; productId: string; quantity: number; watts: number }> =
          (data.lines || []).filter((l: { quantity: number }) => l.quantity > 0)
        if (!requestLines.length) throw new DeliveryOrderError("Enter at least 1 panel across the lines", 400)

        const requestedPanels = requestLines.reduce((s, l) => s + l.quantity, 0)
        const soTotalPanels = existing.salesOrder.lines.reduce((s, l) => s + l.quantity, 0)
        // Panels committed by OTHER DOs (delivered + reserved) plus any written-off balance.
        const otherCommitted = existing.salesOrder.deliveryOrders
          .filter((d) => d.id !== id)
          .reduce((s, d) => s + committedPanels(d.stockMovements), 0)
        const remaining = soTotalPanels - otherCommitted - existing.salesOrder.balanceCancelledQty
        if (requestedPanels > remaining) {
          throw new DeliveryOrderError(`Requested ${requestedPanels} panels but only ${remaining} remain undelivered on this sales order`, 422)
        }

        // Release the current outstanding reservations before re-planning
        const outstanding = getOutstandingReservations(existing.stockMovements)
        if (outstanding.length) {
          await tx.stockMovement.createMany({
            data: outstanding.map((reservation) => ({
              stockEntryId: reservation.stockEntryId,
              type: "RELEASE" as const,
              quantity: reservation.quantity,
              watts: reservation.watts,
              soId: existing.soId,
              doId: existing.id,
              userId: session.userId || null,
              reason: `Released while editing ${existing.doNumber}`,
            })),
          })
        }

        // Re-reserve in the (possibly different) warehouse
        const warehouseId = data.warehouseId || existing.warehouseId
        const wattageByProduct = Object.fromEntries(
          existing.salesOrder.lines.map((l) => [l.productId, l.product.wattage])
        )
        const productIds = Array.from(new Set(requestLines.map((l) => l.productId)))
        const stockEntries = await tx.stockEntry.findMany({
          where: { warehouseId, productId: { in: productIds } },
          include: { movements: { select: { type: true, quantity: true, watts: true, stockEntryId: true } } },
          orderBy: [{ receivedAt: "asc" }, { createdAt: "asc" }],
        })

        const reservationPlan = buildReservationPlan({
          stockEntries,
          orderLines: requestLines.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
            watts: line.watts,
            wattage: wattageByProduct[line.productId] || 0,
          })),
        })

        if (reservationPlan.shortages.length > 0) {
          const shortageDetails = reservationPlan.shortages
            .map((s) => {
              const name = existing.salesOrder.lines.find((l) => l.productId === s.productId)?.product.name || "Unknown"
              return `${name}: requested ${s.requestedQuantity}, available ${s.availableQuantity}`
            })
            .join("; ")
          throw new DeliveryOrderError(`Insufficient available stock in the selected warehouse. ${shortageDetails}`, 422)
        }

        await tx.stockMovement.createMany({
          data: reservationPlan.allocations.map((allocation) => ({
            stockEntryId: allocation.stockEntryId,
            type: "RESERVATION" as const,
            quantity: allocation.quantity,
            watts: allocation.watts,
            soId: existing.soId,
            doId: existing.id,
            userId: session.userId || null,
            reason: `Reserved for edited ${existing.doNumber}`,
          })),
        })

        const quantity = requestLines.reduce((s, l) => s + l.quantity, 0)
        const watts = requestLines.reduce((s, l) => s + l.watts, 0)

        // Any edit invalidates a prior authorization — back to PENDING for re-approval
        return tx.deliveryOrder.update({
          where: { id },
          data: {
            warehouseId,
            quantity,
            watts,
            status: "PENDING",
            authorizedBy: null,
            authorizedAt: null,
            referenceNo: data.referenceNo !== undefined ? data.referenceNo?.trim() || null : existing.referenceNo,
            validityDays: data.validityDays ? parseInt(data.validityDays) : existing.validityDays,
            notes: data.notes !== undefined ? data.notes : existing.notes,
            lines: {
              deleteMany: {},
              create: requestLines.map((l) => ({
                soLineId: l.soLineId || null,
                productId: l.productId,
                quantity: l.quantity,
                watts: l.watts,
              })),
            },
          },
          include: {
            salesOrder: { include: { customer: true, lines: { include: { product: true } } } },
            warehouse: true,
            lines: { include: { product: true } },
          },
        })
      })

      await writeAuditLog({
        userId: session.userId,
        action: "UPDATE",
        entity: "DeliveryOrder",
        entityId: id,
        changes: { warehouseId: updated.warehouseId, quantity: updated.quantity, edited: true },
      })

      return Response.json(updated)
    }

    // Light update: status / notes / reference only
    const deliveryOrder = await prisma.deliveryOrder.update({
      where: { id },
      data: {
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        ...(data.referenceNo !== undefined ? { referenceNo: data.referenceNo?.trim() || null } : {}),
      },
    })
    return Response.json(deliveryOrder)
  } catch (error) {
    if (error instanceof DeliveryOrderError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    console.error(error)
    return Response.json({ error: "Failed to update delivery order" }, { status: 500 })
  }
}
