import { prisma } from "@/lib/prisma"

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const customer = await prisma.customer.findUnique({
      where: { id },
      include: { contacts: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] } },
    })
    if (!customer) return Response.json({ error: "Not found" }, { status: 404 })
    return Response.json(customer)
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to fetch customer" }, { status: 500 })
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const data = await request.json()
    const contacts: { name: string; whatsapp: string; isPrimary?: boolean }[] = data.contacts || []

    // Replace all contacts: delete existing then recreate
    await prisma.customerContact.deleteMany({ where: { customerId: id } })

    const customer = await prisma.customer.update({
      where: { id },
      data: {
        name: data.name,
        type: data.type,
        ntn: data.ntn || null,
        strn: data.strn || null,
        address: data.address || null,
        contactPerson: data.contactPerson || null,
        contactPhone: data.contactPhone || null,
        contactEmail: data.contactEmail || null,
        creditLimit: data.creditLimit ? parseFloat(data.creditLimit) : null,
        paymentTerms: data.paymentTerms,
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
    return Response.json(customer)
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to update customer" }, { status: 500 })
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await prisma.customer.update({ where: { id }, data: { active: false } })
    return Response.json({ success: true })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to delete customer" }, { status: 500 })
  }
}
