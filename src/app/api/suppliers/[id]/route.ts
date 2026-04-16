import { prisma } from "@/lib/prisma"

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supplier = await prisma.supplier.findUnique({ where: { id } })
    if (!supplier) return Response.json({ error: "Not found" }, { status: 404 })
    return Response.json(supplier)
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to fetch supplier" }, { status: 500 })
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const data = await request.json()
    const supplier = await prisma.supplier.update({
      where: { id },
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
        active: data.active,
      },
    })
    return Response.json(supplier)
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to update supplier" }, { status: 500 })
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await prisma.supplier.update({ where: { id }, data: { active: false } })
    return Response.json({ success: true })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to delete supplier" }, { status: 500 })
  }
}
