import { prisma } from "@/lib/prisma"
import { requirePortal } from "@/lib/portal-session"

export async function GET() {
  const auth = await requirePortal()
  if (auth instanceof Response) return auth

  const invoices = await prisma.invoice.findMany({
    where: { customerId: auth.session.customerId },
    select: {
      id: true,
      invoiceNumber: true,
      status: true,
      grandTotal: true,
      createdAt: true,
      salesOrder: { select: { soNumber: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  })
  return Response.json(invoices)
}
