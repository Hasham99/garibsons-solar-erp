import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth"

export async function GET() {
  try {
    const expenses = await prisma.expense.findMany({
      include: { createdBy: { select: { name: true } } },
      orderBy: { date: "desc" },
    })
    return Response.json(expenses)
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to fetch expenses" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const data = await request.json()
    const session = await getSession()

    if (!data.date || !data.category || !data.description || !data.amount) {
      return Response.json({ error: "Date, category, description and amount are required" }, { status: 400 })
    }

    const expense = await prisma.expense.create({
      data: {
        date: new Date(data.date),
        category: data.category,
        description: data.description,
        amount: parseFloat(data.amount),
        paidTo: data.paidTo || null,
        reference: data.reference || null,
        notes: data.notes || null,
        createdById: session.userId || null,
      },
    })
    return Response.json(expense, { status: 201 })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to create expense" }, { status: 500 })
  }
}
