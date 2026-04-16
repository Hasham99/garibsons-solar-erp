import { prisma } from "@/lib/prisma"
import { getNextRef } from "@/lib/counter"

export async function GET() {
  try {
    const costings = await prisma.costingCalculation.findMany({
      include: { exchangeRate: true, taxConfig: true },
      orderBy: { createdAt: "desc" },
    })
    return Response.json(costings)
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to fetch costings" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const data = await request.json()
    const reference = await getNextRef("COSTING", "COST")

    const costing = await prisma.costingCalculation.create({
      data: {
        reference,
        status: data.status || "DRAFT",
        fobPerWatt: parseFloat(data.fobPerWatt),
        freightPerWatt: parseFloat(data.freightPerWatt),
        exchangeRateId: data.exchangeRateId || null,
        customExchangeRate: data.customExchangeRate ? parseFloat(data.customExchangeRate) : null,
        taxConfigId: data.taxConfigId || null,
        customTaxRate: data.customTaxRate ? parseFloat(data.customTaxRate) : null,
        panelWattage: parseInt(data.panelWattage),
        totalPanels: parseInt(data.totalPanels),
        notes: data.notes,
        cifPerWattUsd: parseFloat(data.cifPerWattUsd),
        effectiveExRate: parseFloat(data.effectiveExRate),
        cifPerWattPkr: parseFloat(data.cifPerWattPkr),
        taxRate: parseFloat(data.taxRate),
        taxPerWatt: parseFloat(data.taxPerWatt),
        handlingPerWatt: parseFloat(data.handlingPerWatt),
        landedCostPerWatt: parseFloat(data.landedCostPerWatt),
        landedCostPerPanel: parseFloat(data.landedCostPerPanel),
        totalShipmentValue: parseFloat(data.totalShipmentValue),
        // Import cost breakdown
        impLcValuePkr: data.impLcValuePkr ? parseFloat(data.impLcValuePkr) : null,
        impFreightFob: data.impFreightFob ? parseFloat(data.impFreightFob) : null,
        impBankCharges: data.impBankCharges ? parseFloat(data.impBankCharges) : null,
        impMarineInsurance: data.impMarineInsurance ? parseFloat(data.impMarineInsurance) : null,
        impSalesTax: data.impSalesTax ? parseFloat(data.impSalesTax) : null,
        impExcise: data.impExcise ? parseFloat(data.impExcise) : null,
        impShippingDO: data.impShippingDO ? parseFloat(data.impShippingDO) : null,
        impTerminalHandling: data.impTerminalHandling ? parseFloat(data.impTerminalHandling) : null,
        impMiscClearing: data.impMiscClearing ? parseFloat(data.impMiscClearing) : null,
        impTransportation: data.impTransportation ? parseFloat(data.impTransportation) : null,
        impMiscAdminGs: data.impMiscAdminGs ? parseFloat(data.impMiscAdminGs) : null,
        impTotalCost: data.impTotalCost ? parseFloat(data.impTotalCost) : null,
      },
    })
    return Response.json(costing, { status: 201 })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to create costing" }, { status: 500 })
  }
}
