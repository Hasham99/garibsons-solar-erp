import { prisma } from "@/lib/prisma"

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: customerId } = await params

    const [receiptsAgg, sosAgg] = await Promise.all([
      prisma.customerReceipt.aggregate({
        where: { customerId },
        _sum: { amount: true },
      }),
      prisma.salesOrder.aggregate({
        where: { customerId, status: { not: "CANCELLED" } },
        _sum: { grandTotal: true },
      }),
    ])

    const totalCollected = receiptsAgg._sum.amount || 0
    const totalSOValue = sosAgg._sum.grandTotal || 0
    const balance = totalCollected - totalSOValue

    return Response.json({ totalCollected, totalSOValue, balance })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to fetch balance" }, { status: 500 })
  }
}
