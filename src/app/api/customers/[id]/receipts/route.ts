import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"
import { getNextRef } from "@/lib/counter"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: customerId } = await params
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get("page") || "1")
    const limit = parseInt(searchParams.get("limit") || "50")
    const skip = (page - 1) * limit

    const [receipts, total] = await Promise.all([
      prisma.customerReceipt.findMany({
        where: { customerId },
        include: { bank: { select: { name: true } }, createdBy: { select: { name: true } } },
        orderBy: { valueDate: "desc" },
        skip,
        take: limit,
      }),
      prisma.customerReceipt.count({ where: { customerId } }),
    ])

    return Response.json({ receipts, total, page, limit })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to fetch receipts" }, { status: 500 })
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session.isLoggedIn) return Response.json({ error: "Unauthorized" }, { status: 401 })

    const { id: customerId } = await params
    const data = await request.json()
    const { bankId, amount, reference, valueDate, whatsappDate, notes } = data

    if (!bankId || !amount || !valueDate) {
      return Response.json({ error: "bankId, amount, and valueDate are required" }, { status: 400 })
    }

    const parsedAmount = parseFloat(amount)
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return Response.json({ error: "Amount must be a positive number" }, { status: 400 })
    }

    const customer = await prisma.customer.findUnique({ where: { id: customerId } })
    if (!customer) return Response.json({ error: "Customer not found" }, { status: 404 })

    const receiptNo = await getNextRef("RCP", "RCP", { includeYear: true, padStart: 4 })

    const receipt = await prisma.customerReceipt.create({
      data: {
        receiptNo,
        customerId,
        bankId,
        amount: parsedAmount,
        reference: reference || null,
        valueDate: new Date(valueDate),
        whatsappDate: whatsappDate ? new Date(whatsappDate) : null,
        notes: notes || null,
        createdById: session.userId || null,
      },
      include: { bank: { select: { name: true } }, createdBy: { select: { name: true } } },
    })

    await writeAuditLog({
      userId: session.userId,
      action: "CREATE",
      entity: "CustomerReceipt",
      entityId: receipt.id,
      changes: { receiptNo, amount: parsedAmount, customerId },
    })

    return Response.json(receipt, { status: 201 })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to create receipt" }, { status: 500 })
  }
}
