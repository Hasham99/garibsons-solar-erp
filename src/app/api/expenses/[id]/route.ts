import { prisma } from "@/lib/prisma"

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const data = await request.json()

    const expense = await prisma.expense.update({
      where: { id },
      data: {
        date: new Date(data.date),
        category: data.category,
        description: data.description,
        amount: parseFloat(data.amount),
        paidTo: data.paidTo || null,
        reference: data.reference || null,
        notes: data.notes || null,
      },
    })
    return Response.json(expense)
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to update expense" }, { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await prisma.expense.delete({ where: { id } })
    return Response.json({ success: true })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to delete expense" }, { status: 500 })
  }
}
