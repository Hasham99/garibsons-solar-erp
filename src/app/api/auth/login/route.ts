import { prisma } from "@/lib/prisma"
import { getSession, verifyPassword } from "@/lib/auth"

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return Response.json({ error: "Email and password required" }, { status: 400 })
    }

    const user = await prisma.user.findUnique({ where: { email } })

    if (!user || !user.active) {
      return Response.json({ error: "Invalid credentials" }, { status: 401 })
    }

    const valid = await verifyPassword(password, user.password)
    if (!valid) {
      return Response.json({ error: "Invalid credentials" }, { status: 401 })
    }

    const session = await getSession()
    session.userId = user.id
    session.name = user.name
    session.email = user.email
    session.role = user.role
    session.isLoggedIn = true
    await session.save()

    return Response.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } })
  } catch (error) {
    console.error("Login error:", error)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}
