import { getSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { computeAccess } from "@/lib/permissions/resolve"

// How long the cookie's cached identity/permissions are trusted before we
// re-verify against the DB. Keeps `me` a 0-query call on almost every load.
const FRESH_MS = 5 * 60 * 1000

export async function GET() {
  try {
    const session = await getSession()

    if (!session.isLoggedIn || !session.userId) {
      return Response.json({ error: "Not authenticated" }, { status: 401 })
    }

    const now = Date.now()

    // Fast path — everything the client needs is already in the (encrypted)
    // cookie, and it was verified recently. No DB round-trip.
    if (session.perms && session.permsCheckedAt && now - session.permsCheckedAt < FRESH_MS) {
      return Response.json({
        user: {
          id: session.userId,
          name: session.name,
          email: session.email,
          role: session.role,
          fullAccess: Boolean(session.fullAccess),
          perms: session.perms,
        },
      })
    }

    // Slow path — re-verify against the DB (catches deactivation, role/permission
    // changes) and refresh the cookie. Runs at most once per FRESH_MS per session.
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        active: true,
        name: true,
        email: true,
        role: true,
        fullAccess: true,
        roleRef: {
          select: {
            title: true,
            fullAccess: true,
            permissions: { select: { module: true, canRead: true, canWrite: true } },
          },
        },
        permissions: { select: { module: true, canRead: true, canWrite: true } },
      },
    })

    if (!user || !user.active) {
      session.destroy()
      return Response.json({ error: "Not authenticated" }, { status: 401 })
    }

    const access = computeAccess(user)
    const roleTitle = user.roleRef?.title ?? user.role

    session.name = user.name
    session.email = user.email
    session.role = roleTitle
    session.fullAccess = access.fullAccess
    session.perms = access.perms
    session.permsCheckedAt = now
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
