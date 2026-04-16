import { prisma } from "@/lib/prisma"

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const warehouse = await prisma.warehouse.findUnique({
      where: { id },
      include: { contacts: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] } },
    })
    if (!warehouse) return Response.json({ error: "Not found" }, { status: 404 })
    return Response.json(warehouse)
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to fetch warehouse" }, { status: 500 })
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const data = await request.json()
    const contacts: { name: string; whatsapp: string }[] = data.contacts || []

    await prisma.warehouseContact.deleteMany({ where: { warehouseId: id } })

    const warehouse = await prisma.warehouse.update({
      where: { id },
      data: {
        name: data.name,
        location: data.location,
        godown: data.godown || null,
        manager: data.manager || null,
        active: data.active,
        contacts: contacts.length > 0 ? {
          create: contacts.map((c, i) => ({
            name: c.name,
            whatsapp: c.whatsapp,
            isPrimary: i === 0,
          })),
        } : undefined,
      },
      include: { contacts: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] } },
    })
    return Response.json(warehouse)
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to update warehouse" }, { status: 500 })
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await prisma.warehouse.update({ where: { id }, data: { active: false } })
    return Response.json({ success: true })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to delete warehouse" }, { status: 500 })
  }
}
