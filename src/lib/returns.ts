/**
 * Sales return / exchange helpers.
 *
 * A return brings dispatched goods back onto their ORIGINAL cost layers (the
 * StockEntry each STOCK_OUT drew from) via positive ADJUSTMENT movements, and
 * issues a credit note. "Returnable" is derived per DO per cost layer:
 *
 *   returnable(layer) = Σ STOCK_OUT(layer, do) − Σ COMPLETED return qty(layer, do)
 *
 * Nothing is persisted as a counter — it's always recomputed from movements +
 * prior return lines so it can't drift (same philosophy as src/lib/delivery.ts).
 */

export interface StockOutMovement {
  type: string
  quantity: number
  watts?: number | null
  stockEntryId?: string | null
  stockEntry?: { productId?: string | null } | null
}

export interface ReturnableLayer {
  stockEntryId: string
  productId: string
  lifted: number
  returned: number
  returnable: number
  wattsPerPanel: number
}

export interface ReturnableProduct {
  productId: string
  returnable: number
  wattsPerPanel: number
}

/**
 * Per-cost-layer returnable quantities for a DO.
 * @param movements the DO's stock movements (only STOCK_OUT rows are used)
 * @param returnedByEntry map of stockEntryId -> already-returned qty (COMPLETED returns)
 */
export function computeReturnableLayers(
  movements: StockOutMovement[],
  returnedByEntry: Record<string, number> = {}
): ReturnableLayer[] {
  const byEntry = new Map<string, { productId: string; lifted: number; watts: number }>()

  for (const m of movements) {
    if (m.type !== "STOCK_OUT" || !m.stockEntryId) continue
    const productId = m.stockEntry?.productId ?? ""
    const current = byEntry.get(m.stockEntryId) ?? { productId, lifted: 0, watts: 0 }
    current.lifted += m.quantity
    current.watts += m.watts ?? 0
    if (!current.productId && productId) current.productId = productId
    byEntry.set(m.stockEntryId, current)
  }

  return Array.from(byEntry.entries())
    .map(([stockEntryId, v]) => {
      const returned = returnedByEntry[stockEntryId] ?? 0
      const returnable = Math.max(0, v.lifted - returned)
      return {
        stockEntryId,
        productId: v.productId,
        lifted: v.lifted,
        returned,
        returnable,
        wattsPerPanel: v.lifted > 0 ? v.watts / v.lifted : 0,
      }
    })
    .filter((l) => l.lifted > 0)
}

/** Aggregate per-layer returnable quantities up to per-product totals (for the UI). */
export function returnableByProduct(layers: ReturnableLayer[]): ReturnableProduct[] {
  const byProduct = new Map<string, { returnable: number; watts: number; panels: number }>()
  for (const l of layers) {
    const cur = byProduct.get(l.productId) ?? { returnable: 0, watts: 0, panels: 0 }
    cur.returnable += l.returnable
    cur.watts += l.returnable * l.wattsPerPanel
    cur.panels += l.returnable
    byProduct.set(l.productId, cur)
  }
  return Array.from(byProduct.entries()).map(([productId, v]) => ({
    productId,
    returnable: v.returnable,
    wattsPerPanel: v.panels > 0 ? v.watts / v.panels : 0,
  }))
}

export interface ReturnStockRow {
  stockEntryId: string
  productId: string
  quantity: number
  watts: number
}

export interface ReturnPlan {
  rows: ReturnStockRow[]
  shortages: Array<{ productId: string; requested: number; available: number }>
}

/**
 * Allocate a per-product return quantity back across the DO's returnable cost
 * layers (oldest STOCK_OUT layer first, matching FIFO dispatch order).
 */
export function planReturnStock(params: {
  layers: ReturnableLayer[]
  returnByProduct: Record<string, number>
}): ReturnPlan {
  const { layers, returnByProduct } = params
  const rows: ReturnStockRow[] = []
  const shortages: ReturnPlan["shortages"] = []

  for (const [productId, requestedRaw] of Object.entries(returnByProduct)) {
    const requested = Math.max(0, Math.floor(requestedRaw))
    if (requested <= 0) continue

    const productLayers = layers.filter((l) => l.productId === productId && l.returnable > 0)
    let need = requested
    for (const layer of productLayers) {
      if (need <= 0) break
      const take = Math.min(layer.returnable, need)
      rows.push({
        stockEntryId: layer.stockEntryId,
        productId,
        quantity: take,
        watts: Math.round(take * layer.wattsPerPanel),
      })
      need -= take
    }

    if (need > 0) {
      const available = productLayers.reduce((s, l) => s + l.returnable, 0)
      shortages.push({ productId, requested, available })
    }
  }

  return { rows, shortages }
}
