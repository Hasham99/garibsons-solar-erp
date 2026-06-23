import { prisma } from "@/lib/prisma"
import { requirePortal } from "@/lib/portal-session"

export async function GET() {
  const auth = await requirePortal()
  if (auth instanceof Response) return auth

  const deliveries = await prisma.deliveryOrder.findMany({
    where: { salesOrder: { customerId: auth.session.customerId }, status: { not: "CANCELLED" } },
    select: {
      id: true,
      doNumber: true,
      status: true,
      quantity: true,
      createdAt: true,
      salesOrder: { select: { soNumber: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  })
  return Response.json(deliveries)
}
