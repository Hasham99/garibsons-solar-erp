import { prisma } from "@/lib/prisma"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const customerId = searchParams.get("customerId")

    const where = customerId ? { customerId } : {}

    const entries = await prisma.partyLedger.findMany({
      where,
      include: {
        customer: true,
        invoice: { select: { invoiceNumber: true } },
        salesOrder: { select: { soNumber: true } },
      },
      orderBy: { date: "asc" },
    })

    // Calculate running balance
    let runningBalance = 0
    const ledger = entries.map((entry) => {
      runningBalance += entry.debit - entry.credit
      return { ...entry, runningBalance }
    })

    return Response.json(ledger)
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to fetch ledger" }, { status: 500 })
  }
}
