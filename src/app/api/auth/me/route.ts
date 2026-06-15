import { getSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { resolveAccess } from "@/lib/permissions/resolve"

export async function GET() {
  try {
    const session = await getSession()

    if (!session.isLoggedIn || !session.userId) {
      return Response.json({ error: "Not authenticated" }, { status: 401 })
    }

    // Re-resolve access from the DB on each load so permission/role changes
    // take effect without forcing the user to log out, and refresh the cookie.
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { active: true, name: true, email: true, roleRef: { select: { title: true } }, role: true },
    })

    if (!user || !user.active) {
      session.destroy()
      return Response.json({ error: "Not authenticated" }, { status: 401 })
    }

    const access = await resolveAccess(session.userId)
    const roleTitle = user.roleRef?.title ?? user.role

    session.name = user.name
    session.email = user.email
    session.role = roleTitle
    session.fullAccess = access.fullAccess
    session.perms = access.perms
    await session.save()

    return Response.json({
      user: {
        id: session.userId,
        name: user.name,
        email: user.email,
        role: roleTitle,
        fullAccess: access.fullAccess,
        perms: access.perms,
      },
    })
  } catch (error) {
    console.error("Me error:", error)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}
