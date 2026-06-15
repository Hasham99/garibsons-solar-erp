import { prisma } from "@/lib/prisma"
import { requireModule } from "@/lib/permissions/guard"
import { writeAuditLog } from "@/lib/audit"
import { permMapToRows } from "../route"

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModule("settings.roles", "read")
  if (auth instanceof Response) return auth

  const { id } = await params
  const role = await prisma.role.findUnique({
    where: { id },
    include: {
      permissions: { select: { module: true, canRead: true, canWrite: true } },
      _count: { select: { users: true } },
    },
  })
  if (!role) return Response.json({ error: "Not found" }, { status: 404 })
  return Response.json(role)
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModule("settings.roles", "write")
  if (auth instanceof Response) return auth

  try {
    const { id } = await params
    const data = await request.json()
    const title = String(data.title || "").trim()
    if (!title) return Response.json({ error: "Title is required" }, { status: 400 })

    const fullAccess = Boolean(data.fullAccess)
    const rows = fullAccess ? [] : permMapToRows(data.permissions)

    // Replace permissions atomically: clear then recreate the role's defaults.
    const role = await prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: id } })
      return tx.role.update({
        where: { id },
        data: {
          title,
          description: data.description?.trim() || null,
          fullAccess,
          permissions: { create: rows },
        },
        include: { permissions: true, _count: { select: { users: true } } },
      })
    })

    await writeAuditLog({
      userId: auth.session.userId,
      action: "UPDATE_ROLE",
      entity: "Role",
      entityId: id,
      changes: { title, fullAccess, permissions: rows.length },
    })

    return Response.json(role)
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return Response.json({ error: "A role with this title already exists" }, { status: 409 })
    }
    console.error(error)
    return Response.json({ error: "Failed to update role" }, { status: 500 })
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModule("settings.roles", "write")
  if (auth instanceof Response) return auth

  try {
    const { id } = await params
    const role = await prisma.role.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    })
    if (!role) return Response.json({ error: "Not found" }, { status: 404 })
    if (role.isSystem) return Response.json({ error: "System roles cannot be deleted" }, { status: 400 })
    if (role._count.users > 0) {
      return Response.json(
        { error: `This role is assigned to ${role._count.users} user(s). Reassign them first.` },
        { status: 400 }
      )
    }

    await prisma.role.delete({ where: { id } })
    await writeAuditLog({
      userId: auth.session.userId,
      action: "DELETE_ROLE",
      entity: "Role",
      entityId: id,
      changes: { title: role.title },
    })
    return Response.json({ ok: true })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to delete role" }, { status: 500 })
  }
}
