import { prisma } from "@/lib/prisma"
import { requirePortal } from "@/lib/portal-session"

export async function GET() {
  const auth = await requirePortal()
  if (auth instanceof Response) return auth

  const orders = await prisma.salesOrder.findMany({
    where: { customerId: auth.session.customerId, status: { not: "CANCELLED" } },
    select: { id: true, soNumber: true, status: true, grandTotal: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  })
  return Response.json(orders)
}
