import { prisma } from "@/lib/prisma"
import { requireModule } from "@/lib/permissions/guard"
import { hashPassword } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModule("masters.customers", "read")
  if (auth instanceof Response) return auth

  const { id: customerId } = await params
  const users = await prisma.customerUser.findMany({
    where: { customerId },
    select: { id: true, name: true, email: true, active: true, lastLoginAt: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  })
  return Response.json(users)
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModule("masters.customers", "write")
  if (auth instanceof Response) return auth

  try {
    const { id: customerId } = await params
    const { name, email, password } = await request.json()

    if (!name || !email || !password) {
      return Response.json({ error: "Name, email, and password are required" }, { status: 400 })
    }
    if (String(password).length < 6) {
      return Response.json({ error: "Password must be at least 6 characters" }, { status: 400 })
    }

    const customer = await prisma.customer.findUnique({ where: { id: customerId } })
    if (!customer) return Response.json({ error: "Customer not found" }, { status: 404 })

    // One portal login per customer.
    const existingForCustomer = await prisma.customerUser.count({ where: { customerId } })
    if (existingForCustomer > 0) {
      return Response.json({ error: "This customer already has a portal login" }, { status: 409 })
    }

    const normalizedEmail = String(email).toLowerCase().trim()
    const existing = await prisma.customerUser.findUnique({ where: { email: normalizedEmail } })
    if (existing) {
      return Response.json({ error: "A portal login with this email already exists" }, { status: 409 })
    }

    const user = await prisma.customerUser.create({
      data: {
        customerId,
        name: String(name).trim(),
        email: normalizedEmail,
        password: await hashPassword(password),
        createdById: auth.session.userId || null,
      },
      select: { id: true, name: true, email: true, active: true, lastLoginAt: true, createdAt: true },
    })

    await writeAuditLog({
      userId: auth.session.userId,
      action: "CREATE",
      entity: "CustomerUser",
      entityId: user.id,
      changes: { email: normalizedEmail, customerId },
    })

    return Response.json(user, { status: 201 })
  } catch (error) {
    console.error("Create portal user error:", error)
    return Response.json({ error: "Failed to create portal login" }, { status: 500 })
  }
}
