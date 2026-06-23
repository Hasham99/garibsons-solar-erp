import { prisma } from "@/lib/prisma"
import { getPortalSession } from "@/lib/portal-session"

export async function GET() {
  const session = await getPortalSession()
  if (!session.isLoggedIn || !session.customerUserId) {
    return Response.json({ user: null })
  }

  const user = await prisma.customerUser.findUnique({
    where: { id: session.customerUserId },
    include: { customer: { select: { id: true, name: true, type: true } } },
  })

  if (!user || !user.active) {
    await session.destroy()
    return Response.json({ user: null })
  }

  return Response.json({
    user: { name: user.name, email: user.email },
    customer: user.customer,
  })
}
