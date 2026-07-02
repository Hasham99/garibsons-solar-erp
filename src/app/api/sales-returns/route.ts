import { prisma } from "@/lib/prisma"
import { getNextRef } from "@/lib/counter"
import { requireModule } from "@/lib/permissions/guard"
import { writeAuditLog } from "@/lib/audit"
import { computeReturnableLayers, planReturnStock } from "@/lib/returns"

class SalesReturnError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

export async function GET(request: Request) {
  try {
    const auth = await requireModule("delivery", "read")
    if (auth instanceof Response) return auth

    const { searchParams } = new URL(request.url)
    const customerId = searchParams.get("customerId")
    const doId = searchParams.get("doId")
    const soId = searchParams.get("soId")

    const returns = await prisma.salesReturn.findMany({
      where: {
        ...(customerId ? { customerId } : {}),
        ...(doId ? { doId } : {}),
        ...(soId ? { soId } : {}),
      },
      include: {
        customer: { select: { id: true, name: true } },
        deliveryOrder: { select: { id: true, doNumber: true } },
        salesOrder: { select: { id: true, soNumber: true } },
        warehouse: { select: { id: true, name: true } },
        createdBy: { select: { name: true } },
        lines: { include: { product: { select: { id: true, name: true, code: true, wattage: true } } } },
      },
      orderBy: { returnDate: "desc" },
    })

    return Response.json(returns)
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to fetch sales returns" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireModule("delivery", "write")
    if (auth instanceof Response) return auth
    const session = auth.session

    const data = await request.json()
    if (!data.doId) return Response.json({ error: "Delivery order is required" }, { status: 400 })

    const type = data.type === "EXCHANGE" ? "EXCHANGE" : "RETURN"
    const requestLines: Array<{ productId: string; quantity: number; ratePerWatt?: number }> = (data.lines || [])
      .map((l: { productId: string; quantity: string | number; ratePerWatt?: string | number }) => ({
        productId: l.productId,
        quantity: Math.max(0, Math.floor(Number(l.quantity) || 0)),
        ratePerWatt: l.ratePerWatt !== undefined && l.ratePerWatt !== "" ? Number(l.ratePerWatt) : undefined,
      }))
      .filter((l: { quantity: number }) => l.quantity > 0)

    if (!requestLines.length) return Response.json({ error: "Enter at least one line to return" }, { status: 400 })

    const returnNumber = await getNextRef("SOL-SR", "SOL-SR", { includeYear: false, padStart: 4 })

    const created = await prisma.$transaction(async (tx) => {
      const deliveryOrder = await tx.deliveryOrder.findUnique({
        where: { id: data.doId },
        select: {
          id: true,
          doNumber: true,
          status: true,
          soId: true,
          warehouseId: true,
          salesOrder: {
            select: {
              id: true,
              soNumber: true,
              customerId: true,
              lines: { select: { id: true, productId: true, ratePerWatt: true } },
            },
          },
          stockMovements: {
            where: { type: "STOCK_OUT" },
            select: { type: true, quantity: true, watts: true, stockEntryId: true, stockEntry: { select: { productId: true } } },
          },
        },
      })

      if (!deliveryOrder) throw new SalesReturnError("Delivery order not found", 404)
      if (!["DISPATCHED", "PARTIALLY_DISPATCHED"].includes(deliveryOrder.status)) {
        throw new SalesReturnError("Only dispatched delivery orders can be returned", 422)
      }

      // Already-returned quantities per cost layer (COMPLETED returns only).
      const priorLines = await tx.salesReturnLine.findMany({
        where: { salesReturn: { doId: deliveryOrder.id, status: "COMPLETED" } },
        select: { stockEntryId: true, quantity: true },
      })
      const returnedByEntry: Record<string, number> = {}
      for (const l of priorLines) {
        if (l.stockEntryId) returnedByEntry[l.stockEntryId] = (returnedByEntry[l.stockEntryId] || 0) + l.quantity
      }

      const layers = computeReturnableLayers(deliveryOrder.stockMovements, returnedByEntry)

      // Validate requested quantities against returnable per product.
      const returnableByProductId: Record<string, number> = {}
      for (const l of layers) returnableByProductId[l.productId] = (returnableByProductId[l.productId] || 0) + l.returnable

      const returnByProduct: Record<string, number> = {}
      for (const rl of requestLines) {
        const available = returnableByProductId[rl.productId] || 0
        if (rl.quantity > available) {
          throw new SalesReturnError(
            `Cannot return ${rl.quantity} of a product — only ${available} remain returnable on ${deliveryOrder.doNumber}`,
            422
          )
        }
        returnByProduct[rl.productId] = (returnByProduct[rl.productId] || 0) + rl.quantity
      }

      const plan = planReturnStock({ layers, returnByProduct })
      if (plan.shortages.length) {
        throw new SalesReturnError("Requested return exceeds returnable stock", 422)
      }

      // Rate per product: explicit override, else the matched SO line's ratePerWatt.
      const soLineByProduct = new Map<string, { id: string; ratePerWatt: number }>()
      for (const sl of deliveryOrder.salesOrder.lines) {
        if (!soLineByProduct.has(sl.productId)) soLineByProduct.set(sl.productId, { id: sl.id, ratePerWatt: sl.ratePerWatt })
      }
      const overrideByProduct: Record<string, number> = {}
      for (const rl of requestLines) if (rl.ratePerWatt !== undefined) overrideByProduct[rl.productId] = rl.ratePerWatt

      const lineData = plan.rows.map((row) => {
        const soLine = soLineByProduct.get(row.productId)
        const ratePerWatt = overrideByProduct[row.productId] ?? soLine?.ratePerWatt ?? 0
        const amount = Math.round(row.watts * ratePerWatt * 100) / 100
        return {
          productId: row.productId,
          stockEntryId: row.stockEntryId,
          soLineId: soLine?.id ?? null,
          quantity: row.quantity,
          watts: row.watts,
          ratePerWatt,
          amount,
        }
      })
      const creditAmount = Math.round(lineData.reduce((s, l) => s + l.amount, 0) * 100) / 100

      const salesReturn = await tx.salesReturn.create({
        data: {
          returnNumber,
          type,
          status: "COMPLETED",
          doId: deliveryOrder.id,
          soId: deliveryOrder.soId,
          customerId: deliveryOrder.salesOrder.customerId,
          warehouseId: deliveryOrder.warehouseId,
          creditAmount,
          reason: data.reason?.trim() || null,
          notes: data.notes?.trim() || null,
          createdById: session.userId || null,
          lines: { create: lineData },
        },
        include: {
          customer: { select: { id: true, name: true } },
          deliveryOrder: { select: { id: true, doNumber: true } },
          salesOrder: { select: { id: true, soNumber: true } },
          warehouse: { select: { id: true, name: true } },
          lines: { include: { product: { select: { id: true, name: true, code: true, wattage: true } } } },
        },
      })

      // Put the goods back onto their original cost layers (positive ADJUSTMENT).
      await tx.stockMovement.createMany({
        data: plan.rows.map((row) => ({
          stockEntryId: row.stockEntryId,
          type: "ADJUSTMENT" as const,
          quantity: row.quantity,
          watts: row.watts,
          soId: deliveryOrder.soId,
          doId: deliveryOrder.id,
          returnId: salesReturn.id,
          userId: session.userId || null,
          reason: `Return ${returnNumber} vs ${deliveryOrder.doNumber}`,
        })),
      })

      return salesReturn
    })

    await writeAuditLog({
      userId: session.userId,
      action: "CREATE",
      entity: "SalesReturn",
      entityId: created.id,
      changes: { returnNumber, type, doId: data.doId, creditAmount: created.creditAmount },
    })

    return Response.json(created, { status: 201 })
  } catch (error) {
    if (error instanceof SalesReturnError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    console.error(error)
    return Response.json({ error: "Failed to create sales return" }, { status: 500 })
  }
}
