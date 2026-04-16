import { prisma } from "@/lib/prisma"

export async function GET() {
  try {
    const warehouses = await prisma.warehouse.findMany({
      orderBy: { name: "asc" },
      include: { contacts: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] } },
    })
    return Response.json(warehouses)
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to fetch warehouses" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const data = await request.json()
    const contacts: { name: string; whatsapp: string }[] = data.contacts || []

    const warehouse = await prisma.warehouse.create({
      data: {
        name: data.name,
        location: data.location,
        godown: data.godown || null,
        manager: data.manager || null,
        active: data.active !== false,
        contacts: contacts.length > 0 ? {
          create: contacts.map((c, i) => ({
            name: c.name,
            whatsapp: c.whatsapp,
            isPrimary: i === 0,
          })),
        } : undefined,
      },
      include: { contacts: true },
    })
    return Response.json(warehouse, { status: 201 })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to create warehouse" }, { status: 500 })
  }
}
