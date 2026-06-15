import { prisma } from "@/lib/prisma"
import { requireModule } from "@/lib/permissions/guard"
import { writeAuditLog } from "@/lib/audit"

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireModule("settings.taxConfigs", "write")
    if (auth instanceof Response) return auth
    const session = auth.session
    const { id } = await params
    const data = await request.json()

    // If setting as default, unset others first
    if (data.isDefault) {
      await prisma.taxConfig.updateMany({ data: { isDefault: false } })
    }

    const config = await prisma.taxConfig.update({
      where: { id },
      data: {
        name: data.name,
        customsDuty: parseFloat(data.customsDuty),
        additionalCD: parseFloat(data.additionalCD || 0),
        excise: parseFloat(data.excise || 0),
        salesTax: parseFloat(data.salesTax),
        additionalST: parseFloat(data.additionalST || 0),
        incomeTax: parseFloat(data.incomeTax),
        handlingPerWatt: parseFloat(data.handlingPerWatt),
        isDefault: data.isDefault || false,
      },
    })

    await writeAuditLog({
      userId: session.userId,
      action: "UPDATE",
      entity: "TaxConfig",
      entityId: id,
      changes: { name: data.name, isDefault: data.isDefault },
    })

    return Response.json(config)
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to update tax config" }, { status: 500 })
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireModule("settings.taxConfigs", "write")
    if (auth instanceof Response) return auth
    const session = auth.session
    const { id } = await params

    // Check if in use
    const inUse = await prisma.costingCalculation.count({ where: { taxConfigId: id } })
    if (inUse > 0) {
      return Response.json({ error: "Cannot delete: tax config is linked to costing calculations" }, { status: 409 })
    }

    await prisma.taxConfig.delete({ where: { id } })

    await writeAuditLog({
      userId: session.userId,
      action: "DELETE",
      entity: "TaxConfig",
      entityId: id,
    })

    return Response.json({ success: true })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to delete tax config" }, { status: 500 })
  }
}
