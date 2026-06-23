import { prisma } from "@/lib/prisma"
import { requireModule } from "@/lib/permissions/guard"
import { hashPassword } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"

export async function PUT(request: Request, { params }: { params: Promise<{ id: string; uid: string }> }) {
  const auth = await requireModule("masters.customers", "write")
  if (auth instanceof Response) return auth

  try {
    const { id: customerId, uid } = await params
    const existing = await prisma.customerUser.findUnique({ where: { id: uid } })
    if (!existing || existing.customerId !== customerId) {
      return Response.json({ error: "Portal login not found" }, { status: 404 })
    }

    const { name, email, active, password } = await request.json()
    const data: { name?: string; email?: string; active?: boolean; password?: string } = {}
    if (typeof name === "string" && name.trim()) data.name = name.trim()
    if (typeof active === "boolean") data.active = active
    if (typeof email === "string" && email.trim()) {
      const normalizedEmail = email.toLowerCase().trim()
      if (normalizedEmail !== existing.email) {
        const clash = await prisma.customerUser.findUnique({ where: { email: normalizedEmail } })
        if (clash && clash.id !== uid) {
          return Response.json({ error: "A portal login with this email already exists" }, { status: 409 })
        }
        data.email = normalizedEmail
      }
    }
    if (typeof password === "string" && password) {
      if (password.length < 6) {
        return Response.json({ error: "Password must be at least 6 characters" }, { status: 400 })
      }
      data.password = await hashPassword(password)
    }

    const user = await prisma.customerUser.update({
      where: { id: uid },
      data,
      select: { id: true, name: true, email: true, active: true, lastLoginAt: true, createdAt: true },
    })

    await writeAuditLog({
      userId: auth.session.userId,
      action: "UPDATE",
      entity: "CustomerUser",
      entityId: uid,
      changes: { active: data.active, passwordReset: Boolean(data.password) },
    })

    return Response.json(user)
  } catch (error) {
    console.error("Update portal user error:", error)
    return Response.json({ error: "Failed to update portal login" }, { status: 500 })
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string; uid: string }> }) {
  const auth = await requireModule("masters.customers", "write")
  if (auth instanceof Response) return auth

  try {
    const { id: customerId, uid } = await params
    const existing = await prisma.customerUser.findUnique({ where: { id: uid } })
    if (!existing || existing.customerId !== customerId) {
      return Response.json({ error: "Portal login not found" }, { status: 404 })
    }

    await prisma.customerUser.delete({ where: { id: uid } })

    await writeAuditLog({
      userId: auth.session.userId,
      action: "DELETE",
      entity: "CustomerUser",
      entityId: uid,
      changes: { email: existing.email, customerId },
    })

    return Response.json({ ok: true })
  } catch (error) {
    console.error("Delete portal user error:", error)
    return Response.json({ error: "Failed to delete portal login" }, { status: 500 })
  }
}
