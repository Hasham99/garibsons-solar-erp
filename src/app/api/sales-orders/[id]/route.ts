import { prisma } from "@/lib/prisma"
import { requireModule } from "@/lib/permissions/guard"
import { writeAuditLog } from "@/lib/audit"
import { buildReservationPlan, getOutstandingReservations } from "@/lib/stock"
import { committedPanels, liftedPanels, recomputeSoStatus } from "@/lib/delivery"

class SalesOrderError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

const EDITABLE_STATUSES = ["DRAFT", "PENDING_PAYMENT", "PAYMENT_CONFIRMED", "DO_ISSUED"]

// Distribute a DO's panel count across the (new) SO lines proportionally so an
// edited SO re-plans its pending DOs to match the new product mix. Mirrors
// buildScaledLines in the DO create route (last line absorbs the remainder).
function scaleDoLines(
  soLines: Array<{ productId: string; quantity: number; wattagePerPanel: number; soLineId: string }>,
  doQuantity: number,
  soTotal: number,
) {
  let remaining = doQuantity
  return soLines
    .map((line, i) => {
      const isLast = i === soLines.length - 1
      const scaled = isLast ? remaining : Math.round((line.quantity / soTotal) * doQuantity)
      remaining -= scaled
      return {
        productId: line.productId,
        soLineId: line.soLineId,
        quantity: scaled,
        watts: Math.round(scaled * line.wattagePerPanel),
        wattage: line.wattagePerPanel,
      }
    })
    .filter((r) => r.quantity > 0)
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const order = await prisma.salesOrder.findUnique({
      where: { id },
      include: {
        customer: true,
        lines: { include: { product: true } },
        deliveryOrders: { include: { warehouse: true } },
        invoices: true,
        quotation: true,
      },
    })
    if (!order) return Response.json({ error: "Not found" }, { status: 404 })
    return Response.json(order)
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to fetch sales order" }, { status: 500 })
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const data = await request.json()

    // Full edit — items/qty/rate live on the SO. Editing an SO that already has
    // PENDING/AUTHORIZED delivery orders auto re-plans those DOs (release + re-reserve)
    // to match the new lines. Dispatched/lifted DOs block the edit → use Return/Exchange.
    if (data.editLines) {
      const auth = await requireModule("sales", "write")
      if (auth instanceof Response) return auth
      const session = auth.session

      const updated = await prisma.$transaction(async (tx) => {
        const existing = await tx.salesOrder.findUnique({
          where: { id },
          include: {
            deliveryOrders: {
              select: {
                id: true,
                doNumber: true,
                status: true,
                quantity: true,
                warehouseId: true,
                stockMovements: {
                  where: { type: { in: ["RESERVATION", "RELEASE", "STOCK_OUT"] } },
                  select: { type: true, quantity: true, watts: true, stockEntryId: true },
                },
              },
            },
          },
        })

        if (!existing) throw new SalesOrderError("Not found", 404)
        if (!EDITABLE_STATUSES.includes(existing.status)) {
          throw new SalesOrderError(
            `${existing.soNumber} is ${existing.status.replace(/_/g, " ")} and can no longer be edited.`,
            422
          )
        }

        // Block if anything has been physically lifted — those goods are gone.
        const liftedDOs = existing.deliveryOrders.filter(
          (d) => liftedPanels(d.stockMovements) > 0 || ["DISPATCHED", "PARTIALLY_DISPATCHED"].includes(d.status)
        )
        if (liftedDOs.length) {
          const nums = liftedDOs.map((d) => d.doNumber).join(", ")
          throw new SalesOrderError(
            `${existing.soNumber} has dispatched/partially-lifted delivery orders (${nums}). Edit is blocked — use Return/Exchange for delivered items.`,
            422
          )
        }

        // Money recompute (identical to the pre-cascade behaviour).
        const subTotal = (data.lines || []).reduce(
          (s: number, l: { totalAmount: string | number }) => s + parseFloat(l.totalAmount as string),
          0
        )
        const gstRate = data.gstInvoice ? parseFloat(data.gstRate) || 0 : 0
        const gstAmount = subTotal * (gstRate / 100)
        const grandTotal = subTotal + gstAmount

        const newSoTotal = (data.lines || []).reduce(
          (s: number, l: { quantity: string | number }) => s + parseInt(l.quantity as string),
          0
        )
        if (newSoTotal <= 0) throw new SalesOrderError("Enter at least one line with quantity", 400)

        // DOs we will re-plan (only pending/authorized survive the lifted guard above).
        const targetDOs = existing.deliveryOrders.filter((d) => ["PENDING", "AUTHORIZED"].includes(d.status))
        const committedByTargets = targetDOs.reduce((s, d) => s + committedPanels(d.stockMovements), 0)
        if (committedByTargets + existing.balanceCancelledQty > newSoTotal) {
          throw new SalesOrderError(
            `New order total (${newSoTotal}) is less than the ${committedByTargets} panel(s) already reserved on delivery orders. Cancel or reduce those DOs first.`,
            422
          )
        }

        // Update the SO + replace its lines. onDelete:SetNull clears DeliveryOrderLine.soLineId
        // for the deleted lines; each affected DO's lines are rebuilt below.
        const order = await tx.salesOrder.update({
          where: { id },
          data: {
            customerId: data.customerId,
            customerType: data.customerType || "DIRECT",
            paymentTerms: data.paymentTerms || "FULL_PAYMENT",
            gstRate,
            subTotal,
            gstAmount,
            grandTotal,
            notes: data.notes,
            ...(data.orderDate ? { orderDate: new Date(data.orderDate) } : {}),
            lines: {
              deleteMany: {},
              create: (data.lines || []).map((line: {
                productId: string
                quantity: string | number
                watts: string | number
                ratePerWatt: string | number
                ratePerPanel: string | number
                totalAmount: string | number
              }) => ({
                productId: line.productId,
                quantity: parseInt(line.quantity as string),
                watts: parseInt(line.watts as string),
                ratePerWatt: parseFloat(line.ratePerWatt as string),
                ratePerPanel: parseFloat(line.ratePerPanel as string),
                totalAmount: parseFloat(line.totalAmount as string),
              })),
            },
          },
          include: { customer: true, lines: { include: { product: true } } },
        })

        // Map new SO lines for scaling (first line per product wins the soLineId).
        const soLinesForScale: Array<{ productId: string; quantity: number; wattagePerPanel: number; soLineId: string }> = []
        const seenProduct = new Set<string>()
        for (const l of order.lines) {
          if (seenProduct.has(l.productId)) continue
          seenProduct.add(l.productId)
          soLinesForScale.push({
            productId: l.productId,
            quantity: l.quantity,
            wattagePerPanel: l.quantity > 0 ? l.watts / l.quantity : l.product.wattage,
            soLineId: l.id,
          })
        }

        // Re-plan each pending/authorized DO to the new lines.
        for (const do_ of targetDOs) {
          const outstanding = getOutstandingReservations(do_.stockMovements)
          if (outstanding.length) {
            await tx.stockMovement.createMany({
              data: outstanding.map((r) => ({
                stockEntryId: r.stockEntryId,
                type: "RELEASE" as const,
                quantity: r.quantity,
                watts: r.watts,
                soId: existing.id,
                doId: do_.id,
                userId: session.userId || null,
                reason: `Released — SO ${existing.soNumber} edited`,
              })),
            })
          }

          const rebuilt = scaleDoLines(soLinesForScale, do_.quantity, newSoTotal)
          if (!rebuilt.length) {
            throw new SalesOrderError(
              `Editing ${existing.soNumber} would empty delivery order ${do_.doNumber}. Cancel that DO first.`,
              422
            )
          }

          const productIds = Array.from(new Set(rebuilt.map((l) => l.productId)))
          const stockEntries = await tx.stockEntry.findMany({
            where: { warehouseId: do_.warehouseId, productId: { in: productIds } },
            include: { movements: { select: { type: true, quantity: true, watts: true, stockEntryId: true } } },
            orderBy: [{ receivedAt: "asc" }, { createdAt: "asc" }],
          })

          const plan = buildReservationPlan({
            stockEntries,
            orderLines: rebuilt.map((l) => ({
              productId: l.productId,
              quantity: l.quantity,
              watts: l.watts,
              wattage: l.wattage,
            })),
          })

          if (plan.shortages.length > 0) {
            const details = plan.shortages
              .map((s) => `product ${s.productId}: need ${s.requestedQuantity}, available ${s.availableQuantity}`)
              .join("; ")
            throw new SalesOrderError(
              `Cannot re-plan ${do_.doNumber} — insufficient stock in its warehouse. ${details}`,
              422
            )
          }

          await tx.stockMovement.createMany({
            data: plan.allocations.map((a) => ({
              stockEntryId: a.stockEntryId,
              type: "RESERVATION" as const,
              quantity: a.quantity,
              watts: a.watts,
              soId: existing.id,
              doId: do_.id,
              userId: session.userId || null,
              reason: `Re-reserved — SO ${existing.soNumber} edited`,
            })),
          })

          await tx.deliveryOrder.update({
            where: { id: do_.id },
            data: {
              quantity: rebuilt.reduce((s, l) => s + l.quantity, 0),
              watts: rebuilt.reduce((s, l) => s + l.watts, 0),
              status: "PENDING",
              authorizedBy: null,
              authorizedAt: null,
              lines: {
                deleteMany: {},
                create: rebuilt.map((l) => ({
                  soLineId: l.soLineId || null,
                  productId: l.productId,
                  quantity: l.quantity,
                  watts: l.watts,
                })),
              },
            },
          })
        }

        // Recompute SO status from fresh DO state.
        const fresh = await tx.salesOrder.findUnique({
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
        if (fresh) {
          const next = recomputeSoStatus({
            lines: fresh.lines,
            deliveryOrders: fresh.deliveryOrders,
            balanceCancelledQty: existing.balanceCancelledQty,
            currentStatus: existing.status,
          })
          if (next && next !== existing.status) {
            await tx.salesOrder.update({ where: { id }, data: { status: next as never } })
          }
        }

        // Keep the legacy audit ledger row in step (ignored by computeLedger).
        await tx.partyLedger.updateMany({
          where: { soId: id },
          data: { debit: grandTotal, balance: grandTotal },
        })

        return { order, replannedDOs: targetDOs.length }
      })

      await writeAuditLog({
        userId: session.userId,
        action: "UPDATE",
        entity: "SalesOrder",
        entityId: id,
        changes: { editLines: true, grandTotal: updated.order.grandTotal, replannedDOs: updated.replannedDOs },
      })

      return Response.json({ ...updated.order, replannedDOs: updated.replannedDOs })
    }

    // Status / proof / notes update
    const updateData: Record<string, unknown> = {}
    if (data.status !== undefined) updateData.status = data.status
    if (data.paymentProofUrl !== undefined) updateData.paymentProofUrl = data.paymentProofUrl
    if (data.notes !== undefined) updateData.notes = data.notes

    const order = await prisma.salesOrder.update({ where: { id }, data: updateData })
    return Response.json(order)
  } catch (error) {
    if (error instanceof SalesOrderError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    console.error(error)
    return Response.json({ error: "Failed to update sales order" }, { status: 500 })
  }
}
