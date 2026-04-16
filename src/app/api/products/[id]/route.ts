import { prisma } from "@/lib/prisma"

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const product = await prisma.product.findUnique({
      where: { id },
      include: { defaultSupplier: { select: { id: true, name: true } } },
    })
    if (!product) return Response.json({ error: "Not found" }, { status: 404 })
    return Response.json(product)
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to fetch product" }, { status: 500 })
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const data = await request.json()
    const product = await prisma.product.update({
      where: { id },
      data: {
        code: data.code,
        name: data.name,
        category: data.category,
        wattage: data.wattage ? parseInt(data.wattage) : undefined,
        brand: data.brand,
        skuName: data.skuName ?? null,
        panelsPerContainer: data.panelsPerContainer ? parseInt(data.panelsPerContainer) : null,
        palletsPerContainer: data.palletsPerContainer ? parseInt(data.palletsPerContainer) : null,
        defaultSupplierId: data.defaultSupplierId || null,
        active: data.active,
      },
      include: { defaultSupplier: { select: { id: true, name: true } } },
    })
    return Response.json(product)
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to update product" }, { status: 500 })
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await prisma.product.update({ where: { id }, data: { active: false } })
    return Response.json({ success: true })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to delete product" }, { status: 500 })
  }
}
