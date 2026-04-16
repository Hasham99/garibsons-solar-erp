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

    const rate = await prisma.exchangeRate.update({
      where: { id },
      data: {
        date: new Date(data.date),
        source: data.source,
        rate: parseFloat(data.rate),
        notes: data.notes,
      },
    })

    await writeAuditLog({
      userId: session.userId,
      action: "UPDATE",
      entity: "ExchangeRate",
      entityId: id,
      changes: { rate: data.rate, source: data.source },
    })

    return Response.json(rate)
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to update exchange rate" }, { status: 500 })
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
    const inUse = await prisma.purchaseOrder.count({ where: { exchangeRateId: id } })
    if (inUse > 0) {
      return Response.json({ error: "Cannot delete: exchange rate is linked to purchase orders" }, { status: 409 })
    }

    await prisma.exchangeRate.delete({ where: { id } })

    await writeAuditLog({
      userId: session.userId,
      action: "DELETE",
      entity: "ExchangeRate",
      entityId: id,
    })

    return Response.json({ success: true })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to delete exchange rate" }, { status: 500 })
  }
}
