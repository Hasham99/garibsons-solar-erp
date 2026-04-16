import { prisma } from "@/lib/prisma"
import { getSession, hashPassword } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"

export async function GET() {
  try {
    const session = await getSession()
    if (session.role !== "ADMIN") {
      return Response.json({ error: "Unauthorized" }, { status: 403 })
    }

    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
      orderBy: { name: "asc" },
    })
    return Response.json(users)
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to fetch users" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (session.role !== "ADMIN") {
      return Response.json({ error: "Unauthorized" }, { status: 403 })
    }

    const data = await request.json()
    const hashedPassword = await hashPassword(data.password)

    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        password: hashedPassword,
        role: data.role || "VIEWER",
        active: data.active !== false,
      },
      select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
    })
    await writeAuditLog({
      userId: session.userId,
      action: "CREATE_USER",
      entity: "User",
      entityId: user.id,
      changes: { name: data.name, email: data.email, role: data.role },
    })

    return Response.json(user, { status: 201 })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to create user" }, { status: 500 })
  }
}
