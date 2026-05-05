import { prisma } from "@/lib/prisma"
import { getOutstandingReservations } from "@/lib/stock"

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const deliveryOrder = await prisma.deliveryOrder.findUnique({
      where: { id },
      include: {
        lines: {
          include: {
            product: {
              select: {
                name: true, code: true, wattage: true,
                panelsPerContainer: true, palletsPerContainer: true,
              },
            },
          },
        },
        salesOrder: {
          include: {
            customer: true,
            lines: {
              include: {
                product: {
                  select: {
                    name: true, code: true, wattage: true,
                    panelsPerContainer: true, palletsPerContainer: true,
                  },
                },
              },
            },
          },
        },
        warehouse: true,
        stockMovements: {
          include: {
            stockEntry: {
              include: {
                product: true,
              },
            },
          },
        },
        invoices: true,
      },
    })
    if (!deliveryOrder) return Response.json({ error: "Not found" }, { status: 404 })

    const outstandingReservations = getOutstandingReservations(deliveryOrder.stockMovements)

    return Response.json({
      ...deliveryOrder,
      outstandingReservations,
    })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to fetch delivery order" }, { status: 500 })
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const data = await request.json()
    const deliveryOrder = await prisma.deliveryOrder.update({
      where: { id },
      data: {
        status: data.status,
        notes: data.notes,
      },
    })
    return Response.json(deliveryOrder)
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to update delivery order" }, { status: 500 })
  }
}
