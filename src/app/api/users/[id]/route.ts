import { prisma } from "@/lib/prisma"
import { getSession, hashPassword } from "@/lib/auth"
import { resolveAccess } from "@/lib/permissions/resolve"
import { can } from "@/lib/permissions/modules"
import { computeUserOverrides } from "@/lib/permissions/overrides"
import { requireModule } from "@/lib/permissions/guard"
import { writeAuditLog } from "@/lib/audit"

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        active: true,
        createdAt: true,
        fullAccess: true,
        roleId: true,
        roleRef: { select: { id: true, title: true } },
        permissions: { select: { module: true, canRead: true, canWrite: true } },
      },
    })
    if (!user) return Response.json({ error: "Not found" }, { status: 404 })
    return Response.json(user)
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to fetch user" }, { status: 500 })
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session.isLoggedIn || !session.userId) {
      return Response.json({ error: "Not authenticated" }, { status: 401 })
    }
    const { id } = await params
    const data = await request.json()

    const access = await resolveAccess(session.userId)
    const canManage = can(access, "settings.users", "write")
    const isSelf = session.userId === id

    if (!canManage && !isSelf) {
      return Response.json({ error: "Forbidden" }, { status: 403 })
    }

    // Everyone allowed here can change their own basic profile.
    const updateData: Record<string, unknown> = {
      name: data.name,
      email: data.email ? String(data.email).toLowerCase().trim() : undefined,
    }
    if (data.password) {
      updateData.password = await hashPassword(data.password)
    }

    // Only managers can change role, access and status.
    if (canManage) {
      if (typeof data.active === "boolean") updateData.active = data.active

      if (data.roleId !== undefined) {
        const role = await prisma.role.findUnique({
          where: { id: data.roleId },
          select: { id: true, permissions: { select: { module: true, canRead: true, canWrite: true } } },
        })
        if (!role) return Response.json({ error: "Selected role does not exist" }, { status: 400 })

        const fullAccess = Boolean(data.fullAccess)
        const overrides = computeUserOverrides(role.permissions, data.permissions, fullAccess)

        updateData.roleId = role.id
        updateData.fullAccess = fullAccess

        // Replace overrides atomically alongside the user update.
        await prisma.$transaction([
          prisma.userPermission.deleteMany({ where: { userId: id } }),
          prisma.user.update({ where: { id }, data: { ...updateData, permissions: { create: overrides } } }),
        ])

        await writeAuditLog({
          userId: session.userId,
          action: "UPDATE_USER",
          entity: "User",
          entityId: id,
          changes: { roleId: role.id, fullAccess, overrides: overrides.length },
        })

        const updated = await prisma.user.findUnique({
          where: { id },
          select: { id: true, name: true, email: true, active: true, fullAccess: true, roleId: true },
        })
        return Response.json(updated)
      }
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: { id: true, name: true, email: true, active: true, fullAccess: true, roleId: true },
    })
    return Response.json(user)
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return Response.json({ error: "A user with this email already exists" }, { status: 409 })
    }
    console.error(error)
    return Response.json({ error: "Failed to update user" }, { status: 500 })
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModule("settings.users", "write")
  if (auth instanceof Response) return auth

  try {
    const { id } = await params

    if (auth.session.userId === id) {
      return Response.json({ error: "You cannot delete your own account" }, { status: 400 })
    }

    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, fullAccess: true, roleRef: { select: { fullAccess: true } } },
    })
    if (!target) return Response.json({ error: "Not found" }, { status: 404 })

    // Never delete the last full-access admin — that would lock everyone out.
    const targetIsAdmin = target.fullAccess || target.roleRef?.fullAccess
    if (targetIsAdmin) {
      const adminCount = await prisma.user.count({
        where: { active: true, OR: [{ fullAccess: true }, { roleRef: { fullAccess: true } }] },
      })
      if (adminCount <= 1) {
        return Response.json({ error: "Cannot delete the only admin. Create another admin first." }, { status: 400 })
      }
    }

    // Optional FKs are SET NULL on delete (records are preserved, creator becomes
    // null); UserPermission rows cascade away.
    await prisma.user.delete({ where: { id } })

    await writeAuditLog({
      userId: auth.session.userId,
      action: "DELETE_USER",
      entity: "User",
      entityId: id,
      changes: { name: target.name, email: target.email },
    })

    return Response.json({ ok: true })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to delete user" }, { status: 500 })
  }
}
