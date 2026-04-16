import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const data = await request.json()
    const session = await getSession()
    if (session.role !== "ADMIN" && session.role !== "PROCUREMENT") {
      return Response.json({ error: "Unauthorized" }, { status: 403 })
    }

    const bank = await prisma.bank.update({
      where: { id },
      data: {
        name: data.name,
        branch: data.branch,
        active: data.active !== false,
      },
    })

    await writeAuditLog({
      userId: session.userId,
      action: "UPDATE",
      entity: "Bank",
      entityId: id,
      changes: { name: data.name, branch: data.branch, active: data.active },
    })

    return Response.json(bank)
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to update bank" }, { status: 500 })
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const session = await getSession()
    if (session.role !== "ADMIN") {
      return Response.json({ error: "Unauthorized" }, { status: 403 })
    }

    // Check if in use
    const inUse = await prisma.purchaseOrder.count({ where: { bankId: id } })
    if (inUse > 0) {
      return Response.json({ error: "Cannot delete: bank is linked to purchase orders" }, { status: 409 })
    }

    await prisma.bank.delete({ where: { id } })

    await writeAuditLog({
      userId: session.userId,
      action: "DELETE",
      entity: "Bank",
      entityId: id,
    })

    return Response.json({ success: true })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to delete bank" }, { status: 500 })
  }
}
