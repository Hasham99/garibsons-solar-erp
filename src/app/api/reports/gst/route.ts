import { prisma } from "@/lib/prisma"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const month = searchParams.get("month") // format: YYYY-MM

    let dateFilter: Record<string, unknown> = {}
    let poDateFilter: Record<string, unknown> = {}

    if (month) {
      const [year, m] = month.split("-")
      const start = new Date(parseInt(year), parseInt(m) - 1, 1)
      const end = new Date(parseInt(year), parseInt(m), 0, 23, 59, 59)
      dateFilter = { invoiceDate: { gte: start, lte: end } }
      poDateFilter = { updatedAt: { gte: start, lte: end } }
    }

    // Output GST — from issued invoices
    const invoices = await prisma.invoice.findMany({
      where: { ...dateFilter, status: { not: "CANCELLED" } },
      include: { salesOrder: { include: { customer: true } } },
      orderBy: { invoiceDate: "asc" },
    })

    // Input GST — from clearing charges on cleared/received POs
    const pos = await prisma.purchaseOrder.findMany({
      where: {
        status: { in: ["CLEARED", "RECEIVED"] },
        gstInputAmount: { not: null },
        ...(month ? poDateFilter : {}),
      },
      include: { product: true, supplier: true },
      orderBy: { updatedAt: "asc" },
    })

    const gstOutput = invoices.map((inv) => ({
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.invoiceDate,
      customer: inv.salesOrder.customer.name,
      customerNTN: inv.salesOrder.customer.ntn,
      customerSTRN: inv.salesOrder.customer.strn,
      subTotal: inv.subTotal,
      gstRate: inv.gstRate,
      gstAmount: inv.gstAmount,
      grandTotal: inv.grandTotal,
    }))

    const gstInput = pos.map((po) => ({
      reference: po.poNumber,
      date: po.updatedAt,
      supplier: po.supplier.name,
      product: po.product.name,
      totalLandedCost: po.totalLandedCost || po.poAmountPkr,
      gstInputAmount: po.gstInputAmount || 0,
    }))

    const totalSales = invoices.reduce((s, i) => s + i.subTotal, 0)
    const totalGSTOutput = invoices.reduce((s, i) => s + i.gstAmount, 0)
    const totalGSTInput = pos.reduce((s, p) => s + (p.gstInputAmount || 0), 0)
    const netGSTPayable = totalGSTOutput - totalGSTInput

    return Response.json({
      gstOutput,
      gstInput,
      summary: {
        totalSales,
        totalGSTOutput,
        totalGSTInput,
        netGSTPayable,
      },
    })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to generate GST report" }, { status: 500 })
  }
}
