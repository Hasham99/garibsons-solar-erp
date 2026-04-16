import { prisma } from "@/lib/prisma"

export async function GET() {
  try {
    const invoices = await prisma.invoice.findMany({
      where: { status: { in: ["UNPAID", "PARTIAL"] } },
      include: {
        salesOrder: { include: { customer: true } },
        payments: true,
      },
    })

    const now = new Date()
    const aging = invoices.map((inv) => {
      const totalPaid = inv.payments.reduce((s, p) => s + p.amount, 0)
      const outstanding = inv.grandTotal - totalPaid
      const daysDiff = Math.floor((now.getTime() - inv.invoiceDate.getTime()) / (1000 * 60 * 60 * 24))

      let bucket = "current"
      if (daysDiff > 90) bucket = "over90"
      else if (daysDiff > 60) bucket = "61to90"
      else if (daysDiff > 30) bucket = "31to60"
      else if (daysDiff > 0) bucket = "1to30"

      return {
        invoiceNumber: inv.invoiceNumber,
        customer: inv.salesOrder.customer.name,
        customerId: inv.customerId,
        invoiceDate: inv.invoiceDate,
        grandTotal: inv.grandTotal,
        totalPaid,
        outstanding,
        daysDiff,
        bucket,
      }
    })

    // Summary buckets
    const summary = {
      current: 0,
      "1to30": 0,
      "31to60": 0,
      "61to90": 0,
      over90: 0,
      total: 0,
    }
    for (const item of aging) {
      summary[item.bucket as keyof typeof summary] += item.outstanding
      summary.total += item.outstanding
    }

    return Response.json({ aging, summary })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to generate receivables report" }, { status: 500 })
  }
}
