import { prisma } from "@/lib/prisma"
import { requireModule } from "@/lib/permissions/guard"
import { writeAuditLog } from "@/lib/audit"
import { summarizeStockEntry } from "@/lib/stock"

class SalesReturnError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireModule("delivery", "write")
    if (auth instanceof Response) return auth
    const session = auth.session

    const { id } = await params

    const result = await prisma.$transaction(async (tx) => {
      const salesReturn = await tx.salesReturn.findUnique({
        where: { id },
        include: {
          lines: {
            select: {
              quantity: true,
              watts: true,
              stockEntryId: true,
              stockEntry: {
                select: {
                  id: true, productId: true, panelQuantity: true, wattQuantity: true,
                  costPerPanel: true, costPerWatt: true, receivedAt: true,
                  movements: { select: { type: true, quantity: true, watts: true, stockEntryId: true } },
                },
              },
            },
          },
        },
      })

      if (!salesReturn) throw new SalesReturnError("Not found", 404)
      if (salesReturn.status === "VOID") return salesReturn

      // Removing returned stock must not drive a cost layer negative — only void
      // while the re-added quantity is still freely available (not re-sold).
      const needByEntry: Record<string, number> = {}
      for (const l of salesReturn.lines) {
        if (l.stockEntryId) needByEntry[l.stockEntryId] = (needByEntry[l.stockEntryId] || 0) + l.quantity
      }
      for (const l of salesReturn.lines) {
        if (!l.stockEntry) continue
        const summary = summarizeStockEntry(l.stockEntry)
        const need = needByEntry[l.stockEntry.id] || 0
        if (summary.availableQuantity < need) {
          throw new SalesReturnError(
            `Cannot void — ${need} returned panel(s) are no longer available (re-sold/reserved) on their stock layer`,
            422
          )
        }
        // Only check each entry once.
        needByEntry[l.stockEntry.id] = -1
      }

      // Reverse the stock-back with negative ADJUSTMENT offsets.
      await tx.stockMovement.createMany({
        data: salesReturn.lines
          .filter((l) => l.stockEntryId)
          .map((l) => ({
            stockEntryId: l.stockEntryId!,
            type: "ADJUSTMENT" as const,
            quantity: -l.quantity,
            watts: -l.watts,
            soId: salesReturn.soId,
            doId: salesReturn.doId,
            returnId: salesReturn.id,
            userId: session.userId || null,
            reason: `Voided return ${salesReturn.returnNumber}`,
          })),
      })

      return tx.salesReturn.update({
        where: { id },
        data: { status: "VOID", voidedAt: new Date(), voidedById: session.userId || null },
      })
    })

    await writeAuditLog({
      userId: session.userId,
      action: "VOID",
      entity: "SalesReturn",
      entityId: id,
      changes: { returnNumber: result.returnNumber },
    })

    return Response.json(result)
  } catch (error) {
    if (error instanceof SalesReturnError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    console.error(error)
    return Response.json({ error: "Failed to void sales return" }, { status: 500 })
  }
}
