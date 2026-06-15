import { prisma } from "@/lib/prisma"
import { requireModule } from "@/lib/permissions/guard"

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await requireModule("sales", "write")
    if (auth instanceof Response) return auth
    const session = auth.session

    const order = await prisma.salesOrder.update({
      where: { id },
      data: {
        status: "PAYMENT_CONFIRMED",
        paymentVerifiedAt: new Date(),
        paymentVerifiedBy: session.name,
      },
    })
    return Response.json(order)
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to verify payment" }, { status: 500 })
  }
}
