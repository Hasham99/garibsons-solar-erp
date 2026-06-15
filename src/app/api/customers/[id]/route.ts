import { prisma } from "@/lib/prisma"
import { requireModule } from "@/lib/permissions/guard"
import { writeAuditLog } from "@/lib/audit"

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
    const auth = await requireModule("masters.customers", "write")
    if (auth instanceof Response) return auth
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
    const auth = await requireModule("masters.customers", "write")
    if (auth instanceof Response) return auth
    const session = auth.session

    const { id } = await params
    const customer = await prisma.customer.findUnique({
      where: { id },
      select: {
        name: true,
        _count: { select: { salesOrders: true, receipts: true, quotations: true, ledgerEntries: true } },
      },
    })
    if (!customer) return Response.json({ error: "Customer not found" }, { status: 404 })

    // A party with transactions cannot be deleted — that would corrupt
    // ledgers and history. They must stay (deactivate instead).
    const c = customer._count
    if (c.salesOrders > 0 || c.receipts > 0 || c.quotations > 0 || c.ledgerEntries > 0) {
      const parts = [
        c.salesOrders > 0 ? `${c.salesOrders} sales order(s)` : null,
        c.receipts > 0 ? `${c.receipts} collection(s)` : null,
        c.quotations > 0 ? `${c.quotations} quotation(s)` : null,
      ].filter(Boolean)
      return Response.json(
        { error: `Cannot delete "${customer.name}" — it has ${parts.join(", ")}. Transfer or remove those first, or deactivate the party instead.` },
        { status: 422 }
      )
    }

    await prisma.customerContact.deleteMany({ where: { customerId: id } })
    await prisma.customer.delete({ where: { id } })

    await writeAuditLog({
      userId: session.userId,
      action: "DELETE",
      entity: "Customer",
      entityId: id,
      changes: { name: customer.name },
    })

    return Response.json({ success: true })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to delete customer" }, { status: 500 })
  }
}
