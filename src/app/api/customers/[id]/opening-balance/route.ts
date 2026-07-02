import { prisma } from "@/lib/prisma"
import { requireModule } from "@/lib/permissions/guard"
import { writeAuditLog } from "@/lib/audit"

const DIRECTIONS = ["RECEIVABLE", "ADVANCE"] as const
type Direction = (typeof DIRECTIONS)[number]

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: customerId } = await params
    const opening = await prisma.openingBalance.findUnique({ where: { customerId } })
    return Response.json(opening)
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to fetch opening balance" }, { status: 500 })
  }
}

// Upsert — one opening balance per party.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireModule("ledger", "write")
    if (auth instanceof Response) return auth
    const session = auth.session

    const { id: customerId } = await params
    const data = await request.json()
    const { amount, direction, date, notes } = data

    if (!date || amount === undefined || amount === null || !direction) {
      return Response.json({ error: "date, amount and direction are required" }, { status: 400 })
    }
    if (!DIRECTIONS.includes(direction as Direction)) {
      return Response.json({ error: "direction must be RECEIVABLE or ADVANCE" }, { status: 400 })
    }
    const parsedAmount = parseFloat(amount)
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return Response.json({ error: "Amount must be a positive number" }, { status: 400 })
    }
    const parsedDate = new Date(date)
    if (isNaN(parsedDate.getTime())) {
      return Response.json({ error: "Invalid date" }, { status: 400 })
    }

    const customer = await prisma.customer.findUnique({ where: { id: customerId } })
    if (!customer) return Response.json({ error: "Customer not found" }, { status: 404 })

    const opening = await prisma.openingBalance.upsert({
      where: { customerId },
      create: {
        customerId,
        amount: parsedAmount,
        direction: direction as Direction,
        date: parsedDate,
        notes: notes || null,
        createdById: session.userId || null,
      },
      update: {
        amount: parsedAmount,
        direction: direction as Direction,
        date: parsedDate,
        notes: notes || null,
      },
    })

    await writeAuditLog({
      userId: session.userId,
      action: "UPSERT",
      entity: "OpeningBalance",
      entityId: opening.id,
      changes: { customerId, amount: parsedAmount, direction },
    })

    return Response.json(opening)
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to save opening balance" }, { status: 500 })
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireModule("ledger", "write")
    if (auth instanceof Response) return auth
    const session = auth.session

    const { id: customerId } = await params
    const existing = await prisma.openingBalance.findUnique({ where: { customerId } })
    if (!existing) return Response.json({ error: "No opening balance to remove" }, { status: 404 })

    await prisma.openingBalance.delete({ where: { customerId } })

    await writeAuditLog({
      userId: session.userId,
      action: "DELETE",
      entity: "OpeningBalance",
      entityId: existing.id,
      changes: { customerId, amount: existing.amount, direction: existing.direction },
    })

    return Response.json({ ok: true })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to remove opening balance" }, { status: 500 })
  }
}
