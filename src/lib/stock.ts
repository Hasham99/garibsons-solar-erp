interface MovementLike {
  type: string
  quantity: number
  watts?: number | null
  stockEntryId?: string | null
}

interface StockEntryLike {
  id: string
  productId: string
  panelQuantity: number
  wattQuantity: number
  costPerPanel: number
  costPerWatt: number
  receivedAt: Date | string
  movements: MovementLike[]
}

interface ReservationRequestLine {
  productId: string
  quantity: number
  watts?: number
  wattage?: number
}

export interface StockEntrySummary {
  panelsSold: number
  currentQuantity: number
  reservedQuantity: number
  availableQuantity: number
  currentWatts: number
  reservedWatts: number
  availableWatts: number
  currentValue: number
  reservedValue: number
  availableValue: number
  agingDays: number
  wattagePerPanel: number
}

export interface ReservationAllocation {
  stockEntryId: string
  productId: string
  quantity: number
  watts: number
  costPerPanel: number
  costPerWatt: number
}

export interface ReservationPlan {
  allocations: ReservationAllocation[]
  shortages: Array<{
    productId: string
    requestedQuantity: number
    availableQuantity: number
  }>
}

export interface OutstandingReservation {
  stockEntryId: string
  quantity: number
  watts: number
}

function sumQuantities(movements: MovementLike[], types: string[]) {
  return movements
    .filter((movement) => types.includes(movement.type))
    .reduce((total, movement) => total + movement.quantity, 0)
}

function toWholeNumber(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.round(value)
}

export function summarizeStockEntry(entry: StockEntryLike, now = new Date()): StockEntrySummary {
  const adjustments = sumQuantities(entry.movements, ["ADJUSTMENT"])
  const stockOut = sumQuantities(entry.movements, ["STOCK_OUT"])
  const reserved = sumQuantities(entry.movements, ["RESERVATION"])
  const released = sumQuantities(entry.movements, ["RELEASE"])
  const wattagePerPanel = entry.panelQuantity > 0 ? entry.wattQuantity / entry.panelQuantity : 0

  const currentQuantity = Math.max(entry.panelQuantity + adjustments - stockOut, 0)
  const reservedQuantity = Math.max(reserved - released - stockOut, 0)
  const availableQuantity = Math.max(currentQuantity - reservedQuantity, 0)

  const currentWatts = toWholeNumber(currentQuantity * wattagePerPanel)
  const reservedWatts = toWholeNumber(reservedQuantity * wattagePerPanel)
  const availableWatts = toWholeNumber(availableQuantity * wattagePerPanel)
  const agingDays = Math.max(
    0,
    Math.floor((now.getTime() - new Date(entry.receivedAt).getTime()) / (1000 * 60 * 60 * 24))
  )

  return {
    panelsSold: stockOut,
    currentQuantity,
    reservedQuantity,
    availableQuantity,
    currentWatts,
    reservedWatts,
    availableWatts,
    currentValue: currentQuantity * entry.costPerPanel,
    reservedValue: reservedQuantity * entry.costPerPanel,
    availableValue: availableQuantity * entry.costPerPanel,
    agingDays,
    wattagePerPanel,
  }
}

export function summarizeStockEntries(entries: StockEntryLike[], now = new Date()) {
  return entries.reduce(
    (totals, entry) => {
      const summary = summarizeStockEntry(entry, now)
      totals.currentPanels += summary.currentQuantity
      totals.reservedPanels += summary.reservedQuantity
      totals.availablePanels += summary.availableQuantity
      totals.currentValue += summary.currentValue
      totals.reservedValue += summary.reservedValue
      totals.availableValue += summary.availableValue
      return totals
    },
    {
      currentPanels: 0,
      reservedPanels: 0,
      availablePanels: 0,
      currentValue: 0,
      reservedValue: 0,
      availableValue: 0,
    }
  )
}

export function buildReservationPlan({
  stockEntries,
  orderLines,
}: {
  stockEntries: StockEntryLike[]
  orderLines: ReservationRequestLine[]
}): ReservationPlan {
  const demandByProduct = new Map<
    string,
    {
      quantity: number
      watts: number
      wattagePerPanel: number
    }
  >()

  for (const line of orderLines) {
    if (!line.productId || line.quantity <= 0) continue
    const current = demandByProduct.get(line.productId)
    const watts = line.watts ?? toWholeNumber(line.quantity * (line.wattage ?? 0))
    const wattagePerPanel = line.quantity > 0 ? watts / line.quantity : line.wattage ?? 0

    demandByProduct.set(line.productId, {
      quantity: (current?.quantity ?? 0) + line.quantity,
      watts: (current?.watts ?? 0) + watts,
      wattagePerPanel: wattagePerPanel || current?.wattagePerPanel || 0,
    })
  }

  const allocations: ReservationAllocation[] = []
  const shortages: ReservationPlan["shortages"] = []

  for (const [productId, demand] of demandByProduct.entries()) {
    let remainingQuantity = demand.quantity
    let availableForProduct = 0

    const matchingEntries = stockEntries
      .filter((entry) => entry.productId === productId)
      .sort((left, right) => new Date(left.receivedAt).getTime() - new Date(right.receivedAt).getTime())

    for (const entry of matchingEntries) {
      const summary = summarizeStockEntry(entry)
      availableForProduct += summary.availableQuantity
      if (summary.availableQuantity <= 0 || remainingQuantity <= 0) continue

      const quantity = Math.min(summary.availableQuantity, remainingQuantity)
      const wattagePerPanel = demand.wattagePerPanel || summary.wattagePerPanel

      allocations.push({
        stockEntryId: entry.id,
        productId,
        quantity,
        watts: toWholeNumber(quantity * wattagePerPanel),
        costPerPanel: entry.costPerPanel,
        costPerWatt: entry.costPerWatt,
      })

      remainingQuantity -= quantity
    }

    if (remainingQuantity > 0) {
      shortages.push({
        productId,
        requestedQuantity: demand.quantity,
        availableQuantity: availableForProduct,
      })
    }
  }

  return { allocations, shortages }
}

export function getOutstandingReservations(movements: MovementLike[]) {
  const grouped = new Map<
    string,
    {
      reservedQty: number
      releasedQty: number
      stockOutQty: number
      reservedWatts: number
      releasedWatts: number
      stockOutWatts: number
    }
  >()

  for (const movement of movements) {
    if (!movement.stockEntryId) continue

    const current = grouped.get(movement.stockEntryId) ?? {
      reservedQty: 0,
      releasedQty: 0,
      stockOutQty: 0,
      reservedWatts: 0,
      releasedWatts: 0,
      stockOutWatts: 0,
    }

    if (movement.type === "RESERVATION") {
      current.reservedQty += movement.quantity
      current.reservedWatts += movement.watts ?? 0
    }

    if (movement.type === "RELEASE") {
      current.releasedQty += movement.quantity
      current.releasedWatts += movement.watts ?? 0
    }

    if (movement.type === "STOCK_OUT") {
      current.stockOutQty += movement.quantity
      current.stockOutWatts += movement.watts ?? 0
    }

    grouped.set(movement.stockEntryId, current)
  }

  return Array.from(grouped.entries())
    .map(([stockEntryId, values]) => ({
      stockEntryId,
      quantity: Math.max(values.reservedQty - values.releasedQty - values.stockOutQty, 0),
      watts: Math.max(values.reservedWatts - values.releasedWatts - values.stockOutWatts, 0),
    }))
    .filter((reservation) => reservation.quantity > 0)
}
