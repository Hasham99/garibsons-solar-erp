import { prisma } from "@/lib/prisma"
import { verifyPassword } from "@/lib/auth"
import { getPortalSession } from "@/lib/portal-session"

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json()
    if (!email || !password) {
      return Response.json({ error: "Email and password are required" }, { status: 400 })
    }

    const user = await prisma.customerUser.findUnique({
      where: { email: String(email).toLowerCase().trim() },
      include: { customer: { select: { id: true, name: true } } },
    })

    // Generic message — don't reveal whether the email exists or is disabled.
    const invalid = () => Response.json({ error: "Invalid email or password" }, { status: 401 })
    if (!user || !user.active) return invalid()

    const ok = await verifyPassword(password, user.password)
    if (!ok) return invalid()

    const session = await getPortalSession()
    session.customerUserId = user.id
    session.customerId = user.customerId
    session.name = user.name
    session.email = user.email
    session.isLoggedIn = true
    await session.save()

    await prisma.customerUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })

    return Response.json({
      user: { name: user.name, email: user.email },
      customer: user.customer,
    })
  } catch (error) {
    console.error("Portal login error:", error)
    return Response.json({ error: "Login failed" }, { status: 500 })
  }
}
