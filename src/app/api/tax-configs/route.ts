import { prisma } from "@/lib/prisma"

export async function GET() {
  try {
    const configs = await prisma.taxConfig.findMany({ orderBy: { createdAt: "desc" } })
    return Response.json(configs)
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to fetch tax configs" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const data = await request.json()

    // If this is set as default, unset others
    if (data.isDefault) {
      await prisma.taxConfig.updateMany({ data: { isDefault: false } })
    }

    const config = await prisma.taxConfig.create({
      data: {
        name: data.name,
        customsDuty: parseFloat(data.customsDuty || 3),
        additionalCD: parseFloat(data.additionalCD || 0),
        excise: parseFloat(data.excise || 0),
        salesTax: parseFloat(data.salesTax || 18),
        additionalST: parseFloat(data.additionalST || 0),
        incomeTax: parseFloat(data.incomeTax || 1.5),
        handlingPerWatt: parseFloat(data.handlingPerWatt || 2),
        isDefault: data.isDefault || false,
      },
    })
    return Response.json(config, { status: 201 })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to create tax config" }, { status: 500 })
  }
}
