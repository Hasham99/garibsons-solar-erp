import { getOutstandingReservations } from "./stock"

/**
 * Derived delivery-quantity model. We never persist "delivered"/"balance"
 * counters — everything is computed from stock movements so it can't drift.
 *
 *   ordered  = DeliveryOrder.quantity            (planned panels)
 *   lifted   = Σ STOCK_OUT                        (physically dispatched / picked up)
 *   balance  = Σ RESERVATION − RELEASE − STOCK_OUT (still reserved, not yet lifted)
 *   committed (to the SO) = lifted + balance      (alive panels: delivered or reserved)
 *
 * A cancelled DO has released everything → lifted 0, balance 0 → committed 0.
 * A settled partial DO (balance cancelled) → lifted Y, balance 0 → committed Y.
 */

export interface MovementRow {
  type: string
  quantity: number
  watts?: number | null
  stockEntryId?: string | null
}

export type DOStatus = "PENDING" | "AUTHORIZED" | "PARTIALLY_DISPATCHED" | "DISPATCHED" | "CANCELLED"

/** Panels physically dispatched for a DO (sum of STOCK_OUT). */
export function liftedPanels(movements: MovementRow[]): number {
  return movements.filter((m) => m.type === "STOCK_OUT").reduce((s, m) => s + m.quantity, 0)
}

export function liftedWatts(movements: MovementRow[]): number {
  return movements.filter((m) => m.type === "STOCK_OUT").reduce((s, m) => s + (m.watts ?? 0), 0)
}

/** Panels still reserved (not yet lifted) for a DO — the cancellable "balance". */
export function reservedPanels(movements: MovementRow[]): number {
  return getOutstandingReservations(movements).reduce((s, r) => s + r.quantity, 0)
}

/** Panels still counting against the SO: delivered + reserved. */
export function committedPanels(movements: MovementRow[]): number {
  return liftedPanels(movements) + reservedPanels(movements)
}

/** Whole pallets for a panel count, from a product's container/pallet packing. */
export function computePallets(
  panels: number,
  packing: { panelsPerContainer?: number | null; palletsPerContainer?: number | null }
): number {
  const ppc = packing.panelsPerContainer ?? 0
  const palc = packing.palletsPerContainer ?? 0
  if (!ppc || !palc) return 0
  const panelsPerPallet = ppc / palc
  if (panelsPerPallet <= 0) return 0
  return Math.ceil(panels / panelsPerPallet)
}

export interface DoProgress {
  ordered: number
  lifted: number
  balance: number
}

export function doProgress(order: { quantity: number; stockMovements: MovementRow[] }): DoProgress {
  const lifted = liftedPanels(order.stockMovements)
  const balance = reservedPanels(order.stockMovements)
  return { ordered: order.quantity, lifted, balance }
}

/* ------------------------------------------------------------------ */
/* SO-level derived quantities                                         */
/* ------------------------------------------------------------------ */

export interface SoLineLike {
  quantity: number
}
export interface DoLike {
  status: string
  quantity: number
  stockMovements: MovementRow[]
}

export function soTotalPanels(lines: SoLineLike[]): number {
  return lines.reduce((s, l) => s + l.quantity, 0)
}

/** Panels of an SO that are delivered or still reserved across all its DOs. */
export function soCommittedPanels(deliveryOrders: DoLike[]): number {
  return deliveryOrders.reduce((s, d) => s + committedPanels(d.stockMovements), 0)
}

export function soLiftedPanels(deliveryOrders: DoLike[]): number {
  return deliveryOrders.reduce((s, d) => s + liftedPanels(d.stockMovements), 0)
}

/** Panels with no delivery order yet and not written off — the deliverable remainder. */
export function soRemainingPanels(
  lines: SoLineLike[],
  deliveryOrders: DoLike[],
  balanceCancelledQty: number
): number {
  return Math.max(0, soTotalPanels(lines) - soCommittedPanels(deliveryOrders) - balanceCancelledQty)
}

const MUTABLE_SO_STATUSES = new Set(["PAYMENT_CONFIRMED", "DO_ISSUED", "DELIVERED"])

/**
 * Recompute an SO's status after a DO/balance change. Returns the new status,
 * or null if it shouldn't change (e.g. SO is CANCELLED/INVOICED/unaffected).
 */
export function recomputeSoStatus(params: {
  lines: SoLineLike[]
  deliveryOrders: DoLike[]
  balanceCancelledQty: number
  currentStatus: string
}): string | null {
  const { lines, deliveryOrders, balanceCancelledQty, currentStatus } = params
  if (!MUTABLE_SO_STATUSES.has(currentStatus)) return null

  const total = soTotalPanels(lines)
  const lifted = soLiftedPanels(deliveryOrders)
  const reserved = deliveryOrders.reduce((s, d) => s + reservedPanels(d.stockMovements), 0)
  const activeDOs = deliveryOrders.filter((d) => d.status !== "CANCELLED")
  const uncommitted = Math.max(0, total - lifted - reserved - balanceCancelledQty)

  let target: string
  if (activeDOs.length === 0 && balanceCancelledQty === 0) target = "PAYMENT_CONFIRMED"
  else if (reserved === 0 && uncommitted === 0) target = "DELIVERED"
  else target = "DO_ISSUED"

  return target === currentStatus ? null : target
}

/* ------------------------------------------------------------------ */
/* Partial dispatch — allocate STOCK_OUT from outstanding reservations  */
/* ------------------------------------------------------------------ */

export interface StockOutRow {
  stockEntryId: string
  quantity: number
  watts: number
}

export interface StockOutPlan {
  rows: StockOutRow[]
  shortages: Array<{ productId: string; requested: number; available: number }>
}

/**
 * Plan the STOCK_OUT movements for lifting `liftByProduct` panels, drawing from
 * the DO's outstanding reservations FIFO (oldest stock entry first) per product.
 */
export function planStockOut(params: {
  outstanding: Array<{ stockEntryId: string; quantity: number; watts: number }>
  entryProduct: Record<string, string>
  entryReceivedAt: Record<string, string | Date>
  liftByProduct: Record<string, number>
}): StockOutPlan {
  const { outstanding, entryProduct, entryReceivedAt, liftByProduct } = params
  const rows: StockOutRow[] = []
  const shortages: StockOutPlan["shortages"] = []

  for (const [productId, requestedRaw] of Object.entries(liftByProduct)) {
    const requested = Math.max(0, Math.floor(requestedRaw))
    if (requested <= 0) continue

    const entries = outstanding
      .filter((o) => entryProduct[o.stockEntryId] === productId && o.quantity > 0)
      .sort(
        (a, b) =>
          new Date(entryReceivedAt[a.stockEntryId]).getTime() - new Date(entryReceivedAt[b.stockEntryId]).getTime()
      )

    let need = requested
    for (const entry of entries) {
      if (need <= 0) break
      const take = Math.min(entry.quantity, need)
      const wattsPerPanel = entry.quantity > 0 ? entry.watts / entry.quantity : 0
      rows.push({ stockEntryId: entry.stockEntryId, quantity: take, watts: Math.round(take * wattsPerPanel) })
      need -= take
    }

    if (need > 0) {
      const available = entries.reduce((s, e) => s + e.quantity, 0)
      shortages.push({ productId, requested, available })
    }
  }

  return { rows, shortages }
}
