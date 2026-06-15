import { prisma } from "@/lib/prisma"
import { hashPassword } from "@/lib/auth"
import { requireModule } from "@/lib/permissions/guard"
import { writeAuditLog } from "@/lib/audit"
import { computeUserOverrides } from "@/lib/permissions/overrides"

export async function GET() {
  const auth = await requireModule("settings.users", "read")
  if (auth instanceof Response) return auth

  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        createdAt: true,
        fullAccess: true,
        roleId: true,
        roleRef: { select: { id: true, title: true } },
        permissions: { select: { module: true, canRead: true, canWrite: true } },
      },
      orderBy: { name: "asc" },
    })
    return Response.json(users)
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to fetch users" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const auth = await requireModule("settings.users", "write")
  if (auth instanceof Response) return auth

  try {
    const data = await request.json()
    if (!data.name || !data.email || !data.password) {
      return Response.json({ error: "Name, email and password are required" }, { status: 400 })
    }
    if (!data.roleId) {
      return Response.json({ error: "A role is required" }, { status: 400 })
    }

    const role = await prisma.role.findUnique({
      where: { id: data.roleId },
      select: { id: true, permissions: { select: { module: true, canRead: true, canWrite: true } } },
    })
    if (!role) return Response.json({ error: "Selected role does not exist" }, { status: 400 })

    const fullAccess = Boolean(data.fullAccess)
    const overrides = computeUserOverrides(role.permissions, data.permissions, fullAccess)
    const hashedPassword = await hashPassword(data.password)

    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: String(data.email).toLowerCase().trim(),
        password: hashedPassword,
        active: data.active !== false,
        roleId: role.id,
        fullAccess,
        permissions: { create: overrides },
      },
      select: { id: true, name: true, email: true, active: true, createdAt: true, fullAccess: true, roleId: true },
    })

    await writeAuditLog({
      userId: auth.session.userId,
      action: "CREATE_USER",
      entity: "User",
      entityId: user.id,
      changes: { name: data.name, email: data.email, roleId: role.id, fullAccess, overrides: overrides.length },
    })

    return Response.json(user, { status: 201 })
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return Response.json({ error: "A user with this email already exists" }, { status: 409 })
    }
    console.error(error)
    return Response.json({ error: "Failed to create user" }, { status: 500 })
  }
}
