import { prisma } from "@/lib/prisma"

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const costing = await prisma.costingCalculation.findUnique({
      where: { id },
      include: { exchangeRate: true, taxConfig: true },
    })
    if (!costing) return Response.json({ error: "Not found" }, { status: 404 })
    return Response.json(costing)
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to fetch costing" }, { status: 500 })
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const data = await request.json()
    const costing = await prisma.costingCalculation.update({
      where: { id },
      data: {
        status: data.status,
        fobPerWatt: data.fobPerWatt ? parseFloat(data.fobPerWatt) : undefined,
        freightPerWatt: data.freightPerWatt ? parseFloat(data.freightPerWatt) : undefined,
        exchangeRateId: data.exchangeRateId || null,
        customExchangeRate: data.customExchangeRate ? parseFloat(data.customExchangeRate) : null,
        taxConfigId: data.taxConfigId || null,
        customTaxRate: data.customTaxRate ? parseFloat(data.customTaxRate) : null,
        panelWattage: data.panelWattage ? parseInt(data.panelWattage) : undefined,
        totalPanels: data.totalPanels ? parseInt(data.totalPanels) : undefined,
        notes: data.notes,
        cifPerWattUsd: data.cifPerWattUsd ? parseFloat(data.cifPerWattUsd) : undefined,
        effectiveExRate: data.effectiveExRate ? parseFloat(data.effectiveExRate) : undefined,
        cifPerWattPkr: data.cifPerWattPkr ? parseFloat(data.cifPerWattPkr) : undefined,
        taxRate: data.taxRate ? parseFloat(data.taxRate) : undefined,
        taxPerWatt: data.taxPerWatt ? parseFloat(data.taxPerWatt) : undefined,
        handlingPerWatt: data.handlingPerWatt ? parseFloat(data.handlingPerWatt) : undefined,
        landedCostPerWatt: data.landedCostPerWatt ? parseFloat(data.landedCostPerWatt) : undefined,
        landedCostPerPanel: data.landedCostPerPanel ? parseFloat(data.landedCostPerPanel) : undefined,
        totalShipmentValue: data.totalShipmentValue ? parseFloat(data.totalShipmentValue) : undefined,
      },
    })
    return Response.json(costing)
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to update costing" }, { status: 500 })
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await prisma.costingCalculation.delete({ where: { id } })
    return Response.json({ success: true })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to delete costing" }, { status: 500 })
  }
}
