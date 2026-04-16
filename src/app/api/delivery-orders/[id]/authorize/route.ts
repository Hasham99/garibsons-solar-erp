import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const session = await getSession()

    if (!session.isLoggedIn) {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (session.role !== "ADMIN") {
      return Response.json({ error: "Only admin can authorize delivery orders" }, { status: 403 })
    }

    const existing = await prisma.deliveryOrder.findUnique({ where: { id } })
    if (!existing) return Response.json({ error: "Not found" }, { status: 404 })
    if (existing.status !== "PENDING") {
      return Response.json({ error: "Only pending delivery orders can be authorized" }, { status: 400 })
    }

    const deliveryOrder = await prisma.deliveryOrder.update({
      where: { id },
      data: {
        status: "AUTHORIZED",
        authorizedBy: session.name,
        authorizedAt: new Date(),
      },
    })

    await writeAuditLog({
      userId: session.userId,
      action: "AUTHORIZE",
      entity: "DeliveryOrder",
      entityId: id,
      changes: { authorizedBy: session.name },
    })

    return Response.json(deliveryOrder)
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to authorize delivery order" }, { status: 500 })
  }
}
