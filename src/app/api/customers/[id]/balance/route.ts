import { prisma } from "@/lib/prisma"

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: customerId } = await params

    const [receiptsAgg, sosAgg, opening] = await Promise.all([
      prisma.customerReceipt.aggregate({
        where: { customerId },
        _sum: { amount: true },
      }),
      prisma.salesOrder.aggregate({
        where: { customerId, status: { not: "CANCELLED" } },
        _sum: { grandTotal: true },
      }),
      prisma.openingBalance.findUnique({ where: { customerId } }),
    ])

    const totalCollected = receiptsAgg._sum.amount || 0
    const totalSOValue = sosAgg._sum.grandTotal || 0

    // Opening balance folds into the running balance without polluting the
    // pure "Total Sales" / "Total Collected" figures. RECEIVABLE increases what
    // the party owes (like an SO); ADVANCE increases their credit (like a receipt).
    const openingDebit = opening?.direction === "RECEIVABLE" ? opening.amount : 0
    const openingCredit = opening?.direction === "ADVANCE" ? opening.amount : 0

    // balance uses the collected-minus-owed convention (negative = receivable).
    const balance = (totalCollected + openingCredit) - (totalSOValue + openingDebit)

    return Response.json({
      totalCollected,
      totalSOValue,
      balance,
      opening: opening
        ? { amount: opening.amount, direction: opening.direction, date: opening.date.toISOString() }
        : null,
    })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to fetch balance" }, { status: 500 })
  }
}
