import { prisma } from "@/lib/prisma"

/**
 * Global record search for the ⌘K palette.
 * Covers customers and every document type: SO, DO, PO, quotation, invoice, receipt, product.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const q = (searchParams.get("q") || "").trim()
    if (q.length < 2) {
      return Response.json({
        customers: [], salesOrders: [], deliveryOrders: [], purchaseOrders: [],
        quotations: [], invoices: [], receipts: [], products: [],
      })
    }

    const contains = { contains: q, mode: "insensitive" as const }

    const [customers, salesOrders, deliveryOrders, purchaseOrders, quotations, invoices, receipts, products] =
      await Promise.all([
        prisma.customer.findMany({
          where: { name: contains },
          select: { id: true, name: true, contactPhone: true },
          orderBy: { name: "asc" },
          take: 5,
        }),
        prisma.salesOrder.findMany({
          where: { soNumber: contains },
          select: { id: true, soNumber: true, grandTotal: true, customer: { select: { id: true, name: true } } },
          orderBy: { createdAt: "desc" },
          take: 5,
        }),
        prisma.deliveryOrder.findMany({
          where: { OR: [{ doNumber: contains }, { referenceNo: contains }] },
          select: {
            id: true, doNumber: true, status: true, quantity: true,
            salesOrder: { select: { soNumber: true, customer: { select: { id: true, name: true } } } },
          },
          orderBy: { createdAt: "desc" },
          take: 5,
        }),
        prisma.purchaseOrder.findMany({
          where: { poNumber: contains },
          select: { id: true, poNumber: true, status: true, supplier: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
          take: 5,
        }),
        prisma.quotation.findMany({
          where: { qNumber: contains },
          select: { id: true, qNumber: true, status: true, customer: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
          take: 5,
        }),
        prisma.invoice.findMany({
          where: { invoiceNumber: contains },
          select: { id: true, invoiceNumber: true, grandTotal: true, salesOrder: { select: { customer: { select: { name: true } } } } },
          orderBy: { invoiceDate: "desc" },
          take: 5,
        }),
        prisma.customerReceipt.findMany({
          where: { receiptNo: contains },
          select: { id: true, receiptNo: true, amount: true, customer: { select: { id: true, name: true } } },
          orderBy: { valueDate: "desc" },
          take: 5,
        }),
        prisma.product.findMany({
          where: { OR: [{ name: contains }, { code: contains }] },
          select: { id: true, name: true, code: true },
          orderBy: { name: "asc" },
          take: 5,
        }),
      ])

    return Response.json({ customers, salesOrders, deliveryOrders, purchaseOrders, quotations, invoices, receipts, products })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Search failed" }, { status: 500 })
  }
}
