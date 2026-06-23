import { prisma } from "@/lib/prisma"
import { requireModule } from "@/lib/permissions/guard"
import { writeAuditLog } from "@/lib/audit"
import { deleteBlob } from "@/lib/storage"

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

    // Whether the party has any history that must be preserved. If so we don't
    // physically delete (its sales orders / receipts / quotations reference it);
    // we archive it instead — hidden from lists & dropdowns, kept for reference.
    const c = customer._count
    const hasHistory =
      c.salesOrders > 0 || c.receipts > 0 || c.quotations > 0 || c.ledgerEntries > 0

    // Either way, the party's editable/current data goes: contacts, portal
    // logins, and any pending/rejected payment slips (purge their blob images
    // first). A VERIFIED slip would have created a receipt — counted above as
    // history — so its slip is preserved alongside the receipt it produced.
    const slips = await prisma.paymentSlip.findMany({
      where: { customerId: id, linkedReceiptId: null },
      select: { id: true, imageUrl: true, imagePurgedAt: true },
    })
    for (const s of slips) {
      if (s.imageUrl && !s.imagePurgedAt) await deleteBlob(s.imageUrl)
    }
    await prisma.paymentSlip.deleteMany({ where: { id: { in: slips.map((s) => s.id) } } })
    await prisma.customerUser.deleteMany({ where: { customerId: id } })
    await prisma.customerContact.deleteMany({ where: { customerId: id } })

    if (hasHistory) {
      await prisma.customer.update({
        where: { id },
        data: { archivedAt: new Date(), active: false },
      })
    } else {
      await prisma.customer.delete({ where: { id } })
    }

    await writeAuditLog({
      userId: session.userId,
      action: hasHistory ? "ARCHIVE" : "DELETE",
      entity: "Customer",
      entityId: id,
      changes: { name: customer.name, archived: hasHistory },
    })

    return Response.json({ success: true, archived: hasHistory })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to delete customer" }, { status: 500 })
  }
}
