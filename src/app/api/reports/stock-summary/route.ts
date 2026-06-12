import { prisma } from "@/lib/prisma"
import { getOutstandingReservations } from "@/lib/stock"

export async function GET(request: Request) {
  try {
    const sp = new URL(request.url).searchParams
    const warehouseId = sp.get("warehouseId")
    const asOfParam = sp.get("asOf")
    const asOf = asOfParam ? new Date(asOfParam) : null
    if (asOf) asOf.setHours(23, 59, 59, 999)

    const stockEntries = await prisma.stockEntry.findMany({
      where: {
        ...(warehouseId ? { warehouseId } : {}),
        ...(asOf ? { receivedAt: { lte: asOf } } : {}),
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            code: true,
            wattage: true,
            panelsPerContainer: true,
            palletsPerContainer: true,
          },
        },
        warehouse: { select: { id: true, name: true } },
        po: { select: { poNumber: true } },
        movements: {
          select: {
            type: true, quantity: true, watts: true, stockEntryId: true, soId: true, doId: true,
            createdAt: true,
            deliveryOrder: { select: { dispatchedAt: true, createdAt: true } },
          },
        },
      },
      orderBy: { receivedAt: "asc" },
    })

    // asOf rewind: bulk-imported movements carry the import timestamp, so date
    // them by their business event — STOCK_IN by the entry's receivedAt
    // (already filtered above), STOCK_OUT by the DO's dispatch/creation date.
    type Movement = (typeof stockEntries)[number]["movements"][number]
    const happenedByAsOf = (m: Movement) => {
      if (!asOf) return true
      if (m.type === "STOCK_IN") return true
      const eff = m.type === "STOCK_OUT"
        ? m.deliveryOrder?.dispatchedAt ?? m.deliveryOrder?.createdAt ?? m.createdAt
        : m.createdAt
      return eff <= asOf
    }

    const rows = stockEntries.map((rawEntry) => {
      const entry = { ...rawEntry, movements: rawEntry.movements.filter(happenedByAsOf) }
      const stockIn = entry.movements
        .filter((m) => m.type === "STOCK_IN")
        .reduce((s, m) => s + m.quantity, 0)
      const stockOut = entry.movements
        .filter((m) => m.type === "STOCK_OUT")
        .reduce((s, m) => s + m.quantity, 0)
      const adjustments = entry.movements
        .filter((m) => m.type === "ADJUSTMENT")
        .reduce((s, m) => s + m.quantity, 0)
      const outstanding = getOutstandingReservations(
        entry.movements.map((m) => ({ ...m, stockEntryId: m.stockEntryId ?? null }))
      )
      const reservedPanels = outstanding.reduce((s, r) => s + r.quantity, 0)
      const currentPanels = entry.panelQuantity - stockOut + adjustments
      const availablePanels = Math.max(0, currentPanels - reservedPanels)

      // SO and DO based stock usage
      const soReserved = entry.movements
        .filter((m) => m.type === "RESERVATION" && m.soId)
        .reduce((s, m) => s + m.quantity, 0)
      const doDispatched = entry.movements
        .filter((m) => m.type === "STOCK_OUT" && m.doId)
        .reduce((s, m) => s + m.quantity, 0)

      const ppc = entry.product.panelsPerContainer
      const pallpc = entry.product.palletsPerContainer
      const containers = ppc && ppc > 0 ? Math.ceil(currentPanels / ppc) : null
      const pallets = ppc && pallpc && ppc > 0
        ? Math.ceil(currentPanels / (ppc / pallpc))
        : null
      const availContainers = ppc && ppc > 0 ? Math.ceil(availablePanels / ppc) : null
      const reservedContainers = ppc && ppc > 0 ? Math.ceil(reservedPanels / ppc) : null

      return {
        id: entry.id,
        product: entry.product.name,
        productCode: entry.product.code,
        wattage: entry.product.wattage,
        warehouse: entry.warehouse.name,
        poNumber: entry.po?.poNumber ?? null,
        receivedAt: entry.receivedAt,
        panelsPerContainer: ppc,
        palletsPerContainer: pallpc,

        // Panel view
        receivedPanels: entry.panelQuantity,
        currentPanels,
        reservedPanels,
        availablePanels,

        // Watt view
        currentWatts: currentPanels * entry.product.wattage,
        availableWatts: availablePanels * entry.product.wattage,
        reservedWatts: reservedPanels * entry.product.wattage,

        // Container view
        containers,
        availContainers,
        reservedContainers,

        // Pallet view
        pallets,

        // SO / DO base
        soReservedPanels: soReserved,
        doDispatchedPanels: doDispatched,

        stockIn,
        costPerPanel: entry.costPerPanel,
        availableValue: availablePanels * entry.costPerPanel,
        totalValue: currentPanels * entry.costPerPanel,
      }
    })

    // Totals
    const totals = {
      currentPanels: rows.reduce((s, r) => s + r.currentPanels, 0),
      availablePanels: rows.reduce((s, r) => s + r.availablePanels, 0),
      reservedPanels: rows.reduce((s, r) => s + r.reservedPanels, 0),
      currentWatts: rows.reduce((s, r) => s + r.currentWatts, 0),
      availableWatts: rows.reduce((s, r) => s + r.availableWatts, 0),
      totalValue: rows.reduce((s, r) => s + r.totalValue, 0),
      availableValue: rows.reduce((s, r) => s + r.availableValue, 0),
      soReservedPanels: rows.reduce((s, r) => s + r.soReservedPanels, 0),
      doDispatchedPanels: rows.reduce((s, r) => s + r.doDispatchedPanels, 0),
    }

    return Response.json({ rows, totals })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to fetch stock summary" }, { status: 500 })
  }
}
