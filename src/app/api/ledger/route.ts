import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth"

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

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session.isLoggedIn) return Response.json({ error: "Unauthorized" }, { status: 401 })

    const data = await request.json()
    const { customerId, amount, date, description, reference, soId } = data

    if (!customerId || !amount || !date || !description) {
      return Response.json({ error: "customerId, amount, date and description are required" }, { status: 400 })
    }

    const creditAmount = parseFloat(amount)
    if (isNaN(creditAmount) || creditAmount <= 0) {
      return Response.json({ error: "Amount must be a positive number" }, { status: 400 })
    }

    // Calculate running balance
    const lastEntry = await prisma.partyLedger.findFirst({
      where: { customerId },
      orderBy: { date: "desc" },
      select: { balance: true },
    })
    const prevBalance = lastEntry?.balance ?? 0
    const newBalance = prevBalance - creditAmount

    const entry = await prisma.partyLedger.create({
      data: {
        customerId,
        date: new Date(date),
        description: description || (reference ? `Collection — ${reference}` : "Collection Receipt"),
        debit: 0,
        credit: creditAmount,
        balance: newBalance,
        soId: soId || null,
      },
      include: {
        customer: true,
        salesOrder: { select: { soNumber: true } },
      },
    })

    return Response.json(entry, { status: 201 })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to record receipt" }, { status: 500 })
  }
}
