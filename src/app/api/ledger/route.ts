import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const customerId = searchParams.get("customerId")

    if (!customerId) {
      return Response.json([])
    }

    // Fetch SOs with their lines and DOs in one query
    const salesOrders = await prisma.salesOrder.findMany({
      where: { customerId, status: { not: "CANCELLED" } },
      include: {
        lines: true,
        deliveryOrders: {
          where: { status: { not: "CANCELLED" } },
          include: { lines: true },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "asc" },
    })

    // Fetch advance collections (CustomerReceipt)
    const receipts = await prisma.customerReceipt.findMany({
      where: { customerId },
      include: { bank: { select: { name: true } } },
      orderBy: { valueDate: "asc" },
    })

    type LedgerRow = {
      id: string
      date: string
      type: "SO" | "DO" | "PARTIAL" | "RECEIPT"
      reference: string
      soNumber?: string
      doNumber?: string
      description: string
      qtyTotal: number
      qtyDelivered: number
      qtyRemaining: number
      debit: number
      credit: number
    }

    const rows: LedgerRow[] = []

    for (const so of salesOrders) {
      const soQty = so.lines.reduce((s, l) => s + l.quantity, 0)
      const doQty = so.deliveryOrders.reduce((s, d) => s + d.quantity, 0)
      const remaining = soQty - doQty

      if (doQty === 0) {
        // No DOs — show SO row
        rows.push({
          id: so.id,
          date: so.createdAt.toISOString(),
          type: "SO",
          reference: so.soNumber,
          soNumber: so.soNumber,
          description: `Sales Order · ${soQty} panels`,
          qtyTotal: soQty,
          qtyDelivered: 0,
          qtyRemaining: soQty,
          debit: so.grandTotal,
          credit: 0,
        })
      } else if (remaining > 0) {
        // Partial — show each DO + a remaining row
        for (const doItem of so.deliveryOrders) {
          rows.push({
            id: doItem.id,
            date: doItem.createdAt.toISOString(),
            type: "DO",
            reference: doItem.doNumber,
            soNumber: so.soNumber,
            doNumber: doItem.doNumber,
            description: `DO for ${so.soNumber} · ${doItem.quantity} panels delivered`,
            qtyTotal: soQty,
            qtyDelivered: doItem.quantity,
            qtyRemaining: 0,
            debit: 0,
            credit: 0,
          })
        }
        // Partial remaining row carries the financial debit
        rows.push({
          id: `${so.id}-remaining`,
          date: so.createdAt.toISOString(),
          type: "PARTIAL",
          reference: so.soNumber,
          soNumber: so.soNumber,
          description: `${so.soNumber} (partial) · ${remaining} panels remaining`,
          qtyTotal: soQty,
          qtyDelivered: doQty,
          qtyRemaining: remaining,
          debit: so.grandTotal,
          credit: 0,
        })
      } else {
        // All DOs complete — show each DO, debit on first only
        so.deliveryOrders.forEach((doItem, idx) => {
          rows.push({
            id: doItem.id,
            date: doItem.createdAt.toISOString(),
            type: "DO",
            reference: doItem.doNumber,
            soNumber: so.soNumber,
            doNumber: doItem.doNumber,
            description: `DO for ${so.soNumber} · ${doItem.quantity} panels`,
            qtyTotal: soQty,
            qtyDelivered: doItem.quantity,
            qtyRemaining: 0,
            debit: idx === 0 ? so.grandTotal : 0,
            credit: 0,
          })
        })
      }
    }

    // Add receipt rows as credits
    for (const r of receipts) {
      rows.push({
        id: r.id,
        date: r.valueDate.toISOString(),
        type: "RECEIPT",
        reference: r.receiptNo,
        description: `Collection — ${r.bank.name}${r.reference ? ` · Ref: ${r.reference}` : ""}`,
        qtyTotal: 0,
        qtyDelivered: 0,
        qtyRemaining: 0,
        debit: 0,
        credit: r.amount,
      })
    }

    // Sort all rows by date ascending
    rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    // Compute running balance
    let runningBalance = 0
    const ledger = rows.map((row) => {
      runningBalance += row.debit - row.credit
      return { ...row, runningBalance }
    })

    // Summary
    const totalDebits = rows.reduce((s, r) => s + r.debit, 0)
    const totalCredits = rows.reduce((s, r) => s + r.credit, 0)

    return Response.json({ rows: ledger, totalDebits, totalCredits, balance: totalDebits - totalCredits })
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
