import { prisma } from "@/lib/prisma"
import { getSession, verifyPassword } from "@/lib/auth"
import { resolveAccess } from "@/lib/permissions/resolve"

export async function POST(request: Request) {
  try {
    const { email: rawEmail, password } = await request.json()

    if (!rawEmail || !password) {
      return Response.json({ error: "Email and password required" }, { status: 400 })
    }

    const email = rawEmail.toLowerCase().trim()
    const user = await prisma.user.findUnique({
      where: { email },
      include: { roleRef: { select: { title: true } } },
    })

    if (!user || !user.active) {
      return Response.json({ error: "Invalid credentials" }, { status: 401 })
    }

    const valid = await verifyPassword(password, user.password)
    if (!valid) {
      return Response.json({ error: "Invalid credentials" }, { status: 401 })
    }

    const access = await resolveAccess(user.id)
    const roleTitle = user.roleRef?.title ?? user.role

    const session = await getSession()
    session.userId = user.id
    session.name = user.name
    session.email = user.email
    session.role = roleTitle
    session.fullAccess = access.fullAccess
    session.perms = access.perms
    session.isLoggedIn = true
    await session.save()

    return Response.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: roleTitle,
        fullAccess: access.fullAccess,
        perms: access.perms,
      },
    })
  } catch (error) {
    console.error("Login error:", error)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}
