import { prisma } from "@/lib/prisma"

export async function GET() {
  try {
    const products = await prisma.product.findMany({
      orderBy: { name: "asc" },
      include: { defaultSupplier: { select: { id: true, name: true } } },
    })
    return Response.json(products)
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to fetch products" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const data = await request.json()
    const product = await prisma.product.create({
      data: {
        code: data.code,
        name: data.name,
        category: data.category || "Solar Panel",
        wattage: parseInt(data.wattage),
        brand: data.brand,
        skuName: data.skuName || null,
        panelsPerContainer: data.panelsPerContainer ? parseInt(data.panelsPerContainer) : null,
        palletsPerContainer: data.palletsPerContainer ? parseInt(data.palletsPerContainer) : null,
        defaultSupplierId: data.defaultSupplierId || null,
        active: data.active !== false,
      },
      include: { defaultSupplier: { select: { id: true, name: true } } },
    })
    return Response.json(product, { status: 201 })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to create product" }, { status: 500 })
  }
}
