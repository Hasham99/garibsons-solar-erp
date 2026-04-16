import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth"

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const session = await getSession()

    if (!["ADMIN", "ACCOUNTS"].includes(session.role || "")) {
      return Response.json({ error: "Unauthorized - only accounts can verify payments" }, { status: 403 })
    }

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
