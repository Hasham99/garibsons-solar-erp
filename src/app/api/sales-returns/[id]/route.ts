import { prisma } from "@/lib/prisma"
import { requireModule } from "@/lib/permissions/guard"

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireModule("delivery", "read")
    if (auth instanceof Response) return auth

    const { id } = await params
    const salesReturn = await prisma.salesReturn.findUnique({
      where: { id },
      include: {
        customer: true,
        deliveryOrder: { select: { id: true, doNumber: true, referenceNo: true } },
        salesOrder: { select: { id: true, soNumber: true } },
        warehouse: { include: { contacts: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] } } },
        createdBy: { select: { name: true } },
        lines: {
          include: {
            product: { select: { id: true, name: true, code: true, wattage: true, panelsPerContainer: true, palletsPerContainer: true } },
          },
        },
      },
    })
    if (!salesReturn) return Response.json({ error: "Not found" }, { status: 404 })
    return Response.json(salesReturn)
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to fetch sales return" }, { status: 500 })
  }
}
