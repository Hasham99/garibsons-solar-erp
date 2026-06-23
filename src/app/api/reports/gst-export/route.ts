import { prisma } from "@/lib/prisma"
import * as XLSX from "xlsx"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const month = searchParams.get("month")

    let dateFilter: Record<string, unknown> = {}
    let poDateFilter: Record<string, unknown> = {}
    let monthLabel = "All"

    if (month) {
      const [year, m] = month.split("-")
      const start = new Date(parseInt(year), parseInt(m) - 1, 1)
      const end = new Date(parseInt(year), parseInt(m), 0, 23, 59, 59)
      dateFilter = { invoiceDate: { gte: start, lte: end } }
      poDateFilter = { updatedAt: { gte: start, lte: end } }
      monthLabel = `${start.toLocaleString("default", { month: "long" })} ${year}`
    }

    const invoices = await prisma.invoice.findMany({
      where: { ...dateFilter, status: { not: "CANCELLED" } },
      include: { salesOrder: { include: { customer: true } } },
      orderBy: { invoiceDate: "asc" },
    })

    const pos = await prisma.purchaseOrder.findMany({
      where: {
        status: { in: ["CLEARED", "RECEIVED"] },
        gstInputAmount: { not: null },
        ...(month ? poDateFilter : {}),
      },
      include: { product: true, supplier: true },
      orderBy: { updatedAt: "asc" },
    })

    const wb = XLSX.utils.book_new()

    // Sheet 1: GST Output (Sales)
    const outputRows = [
      ["GST OUTPUT — SALES INVOICES", `Period: ${monthLabel}`, "", "", "", "", "", ""],
      [],
      ["Invoice No.", "Date", "Customer Name", "NTN", "STRN", "Taxable Value (PKR)", "GST Rate (%)", "GST Amount (PKR)", "Grand Total (PKR)"],
      ...invoices.map((inv) => [
        inv.invoiceNumber,
        new Date(inv.invoiceDate).toLocaleDateString("en-PK"),
        inv.salesOrder.customer.name,
        inv.salesOrder.customer.ntn || "",
        inv.salesOrder.customer.strn || "",
        inv.subTotal.toFixed(2),
        inv.gstRate,
        inv.gstAmount.toFixed(2),
        inv.grandTotal.toFixed(2),
      ]),
      [],
      [
        "TOTAL", "", "", "", "",
        invoices.reduce((s, i) => s + i.subTotal, 0).toFixed(2),
        "",
        invoices.reduce((s, i) => s + i.gstAmount, 0).toFixed(2),
        invoices.reduce((s, i) => s + i.grandTotal, 0).toFixed(2),
      ],
    ]
    const ws1 = XLSX.utils.aoa_to_sheet(outputRows)
    ws1["!cols"] = [{ wch: 15 }, { wch: 12 }, { wch: 30 }, { wch: 14 }, { wch: 14 }, { wch: 20 }, { wch: 12 }, { wch: 18 }, { wch: 18 }]
    XLSX.utils.book_append_sheet(wb, ws1, "GST Output (Sales)")

    // Sheet 2: GST Input (Purchases/Imports)
    const totalGSTInput = pos.reduce((s, p) => s + (p.gstInputAmount || 0), 0)
    const inputRows = [
      ["GST INPUT — IMPORT / PURCHASE", `Period: ${monthLabel}`, "", "", "", ""],
      [],
      ["PO Number", "Date", "Supplier", "Product", "Total Landed Cost (PKR)", "GST Input Amount (PKR)"],
      ...pos.map((po) => [
        po.poNumber,
        new Date(po.updatedAt).toLocaleDateString("en-PK"),
        po.supplier.name,
        po.product.name,
        (po.totalLandedCost || po.poAmountPkr).toFixed(2),
        (po.gstInputAmount || 0).toFixed(2),
      ]),
      [],
      ["TOTAL", "", "", "", "", totalGSTInput.toFixed(2)],
    ]
    const ws2 = XLSX.utils.aoa_to_sheet(inputRows)
    ws2["!cols"] = [{ wch: 15 }, { wch: 12 }, { wch: 30 }, { wch: 25 }, { wch: 22 }, { wch: 22 }]
    XLSX.utils.book_append_sheet(wb, ws2, "GST Input (Imports)")

    // Sheet 3: Summary
    const totalGSTOutput = invoices.reduce((s, i) => s + i.gstAmount, 0)
    const netGST = totalGSTOutput - totalGSTInput
    const summaryRows = [
      [`GST RETURN SUMMARY — ${monthLabel}`],
      [],
      ["GST Output (Sales Tax Collected)", totalGSTOutput.toFixed(2)],
      ["GST Input (Tax Paid on Imports)", totalGSTInput.toFixed(2)],
      ["Net GST Payable / (Refundable)", netGST.toFixed(2)],
      [],
      ["Total Sales (Taxable)", invoices.reduce((s, i) => s + i.subTotal, 0).toFixed(2)],
      ["Total Import Cost", pos.reduce((s, p) => s + (p.totalLandedCost || p.poAmountPkr), 0).toFixed(2)],
      [],
      ["Generated on", new Date().toLocaleString("en-PK")],
      ["System", "Garibsons Solar ERP"],
    ]
    const ws3 = XLSX.utils.aoa_to_sheet(summaryRows)
    ws3["!cols"] = [{ wch: 35 }, { wch: 20 }]
    XLSX.utils.book_append_sheet(wb, ws3, "Summary")

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })

    const filename = `GST_Return_${month || "All"}_${Date.now()}.xlsx`

    return new Response(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to export GST data" }, { status: 500 })
  }
}
