import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const data = await request.json()
    const session = await getSession()

    const totalLandedCost =
      (parseFloat(data.lcValuePkr) || 0) +
      (parseFloat(data.bankCharges) || 0) +
      (parseFloat(data.marineInsurance) || 0) +
      (parseFloat(data.exciseCharges) || 0) +
      (parseFloat(data.shippingDO) || 0) +
      (parseFloat(data.terminalHandling) || 0) +
      (parseFloat(data.clearingCharges) || 0) +
      (parseFloat(data.miscClearing) || 0) +
      (parseFloat(data.containerTransport) || 0)

    const po = await prisma.purchaseOrder.findUnique({ where: { id } })
    if (!po) return Response.json({ error: "Not found" }, { status: 404 })

    const landedCostPerPanel = po.noOfPanels > 0 ? totalLandedCost / po.noOfPanels : 0
    const landedCostPerWatt = po.totalWatts > 0 ? totalLandedCost / po.totalWatts : 0

    const updated = await prisma.purchaseOrder.update({
      where: { id },
      data: {
        lcValuePkr: parseFloat(data.lcValuePkr) || null,
        bankCharges: parseFloat(data.bankCharges) || null,
        marineInsurance: parseFloat(data.marineInsurance) || null,
        exciseCharges: parseFloat(data.exciseCharges) || null,
        shippingDO: parseFloat(data.shippingDO) || null,
        terminalHandling: parseFloat(data.terminalHandling) || null,
        clearingCharges: parseFloat(data.clearingCharges) || null,
        miscClearing: parseFloat(data.miscClearing) || null,
        containerTransport: parseFloat(data.containerTransport) || null,
        totalLandedCost,
        landedCostPerPanel,
        landedCostPerWatt,
        status: "CLEARED",
      },
    })
    await writeAuditLog({
      userId: session.userId,
      action: "CLEAR",
      entity: "PurchaseOrder",
      entityId: id,
      changes: { totalLandedCost, landedCostPerPanel, gstInputAmount: data.gstInputAmount },
    })

    return Response.json(updated)
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to enter clearing charges" }, { status: 500 })
  }
}
