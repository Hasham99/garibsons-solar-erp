import { prisma } from "@/lib/prisma"
import { requireAuth, requireModule } from "@/lib/permissions/guard"
import { writeAuditLog } from "@/lib/audit"
import { can, isModuleKey, type PermMap } from "@/lib/permissions/modules"

/** Convert a PermMap from the client into RolePermission/UserPermission create rows. */
export function permMapToRows(perms: PermMap | undefined) {
  if (!perms) return [] as { module: string; canRead: boolean; canWrite: boolean }[]
  return Object.entries(perms)
    .filter(([key, p]) => isModuleKey(key) && (p?.read || p?.write))
    .map(([module, p]) => ({ module, canRead: Boolean(p.read), canWrite: Boolean(p.write) }))
}

export async function GET() {
  // Readable by role managers and by user managers (who need it to assign roles).
  const auth = await requireAuth()
  if (auth instanceof Response) return auth
  if (!can(auth.access, "settings.roles", "read") && !can(auth.access, "settings.users", "read")) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }

  const roles = await prisma.role.findMany({
    orderBy: [{ isSystem: "desc" }, { title: "asc" }],
    include: {
      permissions: { select: { module: true, canRead: true, canWrite: true } },
      _count: { select: { users: true } },
    },
  })
  return Response.json(roles)
}

export async function POST(request: Request) {
  const auth = await requireModule("settings.roles", "write")
  if (auth instanceof Response) return auth

  try {
    const data = await request.json()
    const title = String(data.title || "").trim()
    if (!title) return Response.json({ error: "Title is required" }, { status: 400 })

    const fullAccess = Boolean(data.fullAccess)
    const rows = fullAccess ? [] : permMapToRows(data.permissions)

    const role = await prisma.role.create({
      data: {
        title,
        description: data.description?.trim() || null,
        fullAccess,
        permissions: { create: rows },
      },
      include: { permissions: true, _count: { select: { users: true } } },
    })

    await writeAuditLog({
      userId: auth.session.userId,
      action: "CREATE_ROLE",
      entity: "Role",
      entityId: role.id,
      changes: { title, fullAccess, permissions: rows.length },
    })

    return Response.json(role, { status: 201 })
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return Response.json({ error: "A role with this title already exists" }, { status: 409 })
    }
    console.error(error)
    return Response.json({ error: "Failed to create role" }, { status: 500 })
  }
}
