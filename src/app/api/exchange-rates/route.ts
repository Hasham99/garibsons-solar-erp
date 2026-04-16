import { prisma } from "@/lib/prisma"

export async function GET() {
  try {
    const rates = await prisma.exchangeRate.findMany({ orderBy: { date: "desc" } })
    return Response.json(rates)
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to fetch exchange rates" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const data = await request.json()
    const rate = await prisma.exchangeRate.create({
      data: {
        date: new Date(data.date),
        source: data.source,
        rate: parseFloat(data.rate),
        notes: data.notes,
      },
    })
    return Response.json(rate, { status: 201 })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to create exchange rate" }, { status: 500 })
  }
}
