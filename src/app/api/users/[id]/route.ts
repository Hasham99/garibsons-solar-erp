import { prisma } from "@/lib/prisma"
import { getSession, hashPassword } from "@/lib/auth"

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
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
    const { id } = await params
    const data = await request.json()

    // Allow users to update their own profile, admins can update anyone
    if (session.role !== "ADMIN" && session.userId !== id) {
      return Response.json({ error: "Unauthorized" }, { status: 403 })
    }

    const updateData: Record<string, unknown> = {
      name: data.name,
      email: data.email,
      role: session.role === "ADMIN" ? data.role : undefined,
      active: session.role === "ADMIN" ? data.active : undefined,
    }

    if (data.password) {
      updateData.password = await hashPassword(data.password)
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: { id: true, name: true, email: true, role: true, active: true },
    })
    return Response.json(user)
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to update user" }, { status: 500 })
  }
}
