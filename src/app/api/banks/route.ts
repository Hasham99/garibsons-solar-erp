import { prisma } from "@/lib/prisma"

export async function GET() {
  try {
    const banks = await prisma.bank.findMany({ orderBy: { name: "asc" } })
    return Response.json(banks)
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to fetch banks" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const data = await request.json()
    const bank = await prisma.bank.create({
      data: {
        name: data.name,
        branch: data.branch,
        active: data.active !== false,
      },
    })
    return Response.json(bank, { status: 201 })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to create bank" }, { status: 500 })
  }
}
