import { prisma } from "@/lib/prisma"

export async function GET() {
  try {
    const suppliers = await prisma.supplier.findMany({
      orderBy: { name: "asc" },
    })
    return Response.json(suppliers)
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to fetch suppliers" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const data = await request.json()
    const supplier = await prisma.supplier.create({
      data: {
        name: data.name,
        address: data.address,
        country: data.country,
        contactPerson: data.contactPerson,
        contactEmail: data.contactEmail,
        contactPhone: data.contactPhone,
        bankDetails: data.bankDetails,
        defaultLeadTime: data.defaultLeadTime ? parseInt(data.defaultLeadTime) : null,
        paymentTerms: data.paymentTerms,
        active: data.active !== false,
      },
    })
    return Response.json(supplier, { status: 201 })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to create supplier" }, { status: 500 })
  }
}
