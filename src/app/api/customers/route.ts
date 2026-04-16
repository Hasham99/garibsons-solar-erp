import { prisma } from "@/lib/prisma"

export async function GET() {
  try {
    const customers = await prisma.customer.findMany({
      orderBy: { name: "asc" },
      include: { contacts: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] } },
    })
    return Response.json(customers)
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to fetch customers" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const data = await request.json()
    const contacts: { name: string; whatsapp: string; isPrimary?: boolean }[] = data.contacts || []

    const customer = await prisma.customer.create({
      data: {
        name: data.name,
        type: data.type || "DIRECT",
        ntn: data.ntn || null,
        strn: data.strn || null,
        address: data.address || null,
        contactPerson: data.contactPerson || null,
        contactPhone: data.contactPhone || null,
        contactEmail: data.contactEmail || null,
        creditLimit: data.creditLimit ? parseFloat(data.creditLimit) : null,
        paymentTerms: data.paymentTerms || "FULL_PAYMENT",
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
    return Response.json(customer, { status: 201 })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to create customer" }, { status: 500 })
  }
}
