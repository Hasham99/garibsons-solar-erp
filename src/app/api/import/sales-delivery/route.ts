import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"
import { buildReservationPlan } from "@/lib/stock"
import { canonicalCustomerKey, cleanStr, norm, parseDate, parseNum, pick, resolveProductId, type Row } from "@/lib/import"
import { randomUUID } from "crypto"

/**
 * Imports the combined "Sale SO & DO" sheet. Each row is one single-line sales
 * order; rows with a DO # (or Remarks "DO issued") are also delivered (creates a
 * delivery order + STOCK_OUT). Uses bulk createMany with pre-generated ids so a
 * few-hundred-row sheet loads in seconds rather than thousands of round-trips.
 */
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session.isLoggedIn) return Response.json({ error: "Unauthorized" }, { status: 401 })

    const { rows } = (await request.json()) as { rows: Row[] }
    if (!Array.isArray(rows)) return Response.json({ error: "Invalid payload" }, { status: 400 })

    const [customers, products, warehouses, existingDOs] = await Promise.all([
      prisma.customer.findMany({ select: { id: true, name: true } }),
      prisma.product.findMany({ select: { id: true, name: true, brand: true, wattage: true } }),
      prisma.warehouse.findMany({ select: { id: true, name: true } }),
      prisma.deliveryOrder.findMany({ select: { doNumber: true } }),
    ])
    const custByNorm = new Map(customers.map((c) => [norm(c.name), c.id]))
    const keeperByKey = new Map<string, string>()
    for (const c of customers) { const k = canonicalCustomerKey(c.name); if (!keeperByKey.has(k)) keeperByKey.set(k, c.id) }
    const resolveCust = (name: string) => custByNorm.get(norm(name)) ?? keeperByKey.get(canonicalCustomerKey(name)) ?? null
    const warehouse = warehouses[0]
    if (!warehouse) return Response.json({ error: "No warehouse configured" }, { status: 422 })
    const existingDoNumbers = new Set(existingDOs.map((d) => d.doNumber))

    const stockEntries = await prisma.stockEntry.findMany({
      where: { warehouseId: warehouse.id },
      select: {
        id: true, productId: true, panelQuantity: true, wattQuantity: true,
        costPerPanel: true, costPerWatt: true, receivedAt: true,
        movements: { select: { type: true, quantity: true, watts: true, stockEntryId: true } },
      },
      orderBy: [{ receivedAt: "asc" }, { createdAt: "asc" }],
    })

    // ---- Pass 1: validate every row into a normalized work list ----
    type Work = {
      customerId: string; productId: string; wattP: number; panels: number; watts: number
      rateWatt: number; ratePerPanel: number; valueSale: number; orderDate: Date
      isDelivered: boolean; doNumber: string | null; referenceNo: string | null
    }
    const work: Work[] = []
    const errors: { row: number; message: string }[] = []
    let soldoFallback = 0

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const line = i + 2
      const customerId = resolveCust(cleanStr(pick(row, "Party Name", "Party", "Customer")))
      if (!customerId) { errors.push({ row: line, message: `Customer "${cleanStr(pick(row, "Party Name", "Party"))}" not found` }); continue }
      const productId = resolveProductId(cleanStr(pick(row, "Item", "Product")), products)
      if (!productId) { errors.push({ row: line, message: `Product "${cleanStr(pick(row, "Item"))}" not found` }); continue }
      const product = products.find((p) => p.id === productId)!
      const panels = parseNum(pick(row, "Qty Panels", "Qty Penals", "Panels", "Quantity"))
      if (panels == null || panels <= 0) { errors.push({ row: line, message: "Panels must be a positive number" }); continue }
      const wattP = parseNum(pick(row, "Watt/P", "Panel Wattage")) ?? product.wattage
      const rateWatt = parseNum(pick(row, "Rate Watts", "Rate/Watt", "Rate Per Watt")) ?? 0
      const watts = Math.round(panels * wattP)
      const ratePerPanel = rateWatt * wattP
      const valueSale = parseNum(pick(row, "Value Sale", "Value", "Amount")) ?? ratePerPanel * panels
      const orderDate = parseDate(pick(row, "Date", "Order Date")) ?? new Date()
      const doRaw = cleanStr(pick(row, "DO #", "DO Number", "DO No", "DO"))
      const isDelivered = Boolean(doRaw) || norm(pick(row, "Remarks", "Status")).includes("doissued")

      let doNumber: string | null = null
      if (isDelivered) {
        doNumber = doRaw ? `DO-${doRaw}` : `SOL-DO-${String(++soldoFallback).padStart(4, "0")}`
        if (existingDoNumbers.has(doNumber)) { errors.push({ row: line, message: `Delivery order ${doNumber} already exists — skipped` }); continue }
        existingDoNumbers.add(doNumber)
      }
      work.push({ customerId, productId, wattP, panels: Math.round(panels), watts, rateWatt, ratePerPanel, valueSale, orderDate, isDelivered, doNumber, referenceNo: doRaw || null })
    }

    // ---- Allocate SO numbers in one shot ----
    const year = new Date().getFullYear()
    let startSerial = 1
    if (work.length > 0) {
      const counter = await prisma.counter.upsert({
        where: { id: `SO-${year}` },
        update: { value: { increment: work.length } },
        create: { id: `SO-${year}`, value: work.length },
      })
      startSerial = counter.value - work.length + 1
    }

    // ---- Pass 2: build bulk records (with pre-generated ids) ----
    const soData: object[] = []
    const soLineData: object[] = []
    const doData: object[] = []
    const doLineData: object[] = []
    const moveData: object[] = []
    let delivered = 0

    work.forEach((w, idx) => {
      const soId = randomUUID()
      const soLineId = randomUUID()
      soData.push({
        id: soId, soNumber: `SO-${year}-${String(startSerial + idx).padStart(3, "0")}`,
        customerId: w.customerId, customerType: "DIRECT", paymentTerms: "FULL_PAYMENT",
        status: w.isDelivered ? "DELIVERED" : "PAYMENT_CONFIRMED",
        gstRate: 0, subTotal: w.valueSale, gstAmount: 0, grandTotal: w.valueSale,
        orderDate: w.orderDate, createdAt: w.orderDate, createdById: session.userId || null,
      })
      soLineData.push({ id: soLineId, soId, productId: w.productId, quantity: w.panels, watts: w.watts, ratePerWatt: w.rateWatt, ratePerPanel: w.ratePerPanel, totalAmount: w.valueSale })
      if (!w.isDelivered) return

      const doId = randomUUID()
      doData.push({
        id: doId, doNumber: w.doNumber!, referenceNo: w.referenceNo, soId, warehouseId: warehouse.id, quantity: w.panels, watts: w.watts,
        status: "DISPATCHED", dispatchedAt: w.orderDate, createdAt: w.orderDate, createdById: session.userId || null,
      })
      doLineData.push({ id: randomUUID(), doId, soLineId, productId: w.productId, quantity: w.panels, watts: w.watts })
      delivered++

      const plan = buildReservationPlan({ stockEntries, orderLines: [{ productId: w.productId, quantity: w.panels, watts: w.watts, wattage: w.wattP }] })
      for (const a of plan.allocations) {
        moveData.push({ stockEntryId: a.stockEntryId, type: "STOCK_OUT", quantity: a.quantity, watts: a.watts, soId, doId, userId: session.userId || null, reason: `Dispatched via ${w.doNumber} (bulk import)` })
        const e = stockEntries.find((x) => x.id === a.stockEntryId)
        if (e) e.movements.push({ type: "STOCK_OUT", quantity: a.quantity, watts: a.watts, stockEntryId: a.stockEntryId })
      }
      if (plan.shortages.length > 0) {
        const s = plan.shortages[0]
        errors.push({ row: 0, message: `${w.doNumber}: stock short by ${s.requestedQuantity - s.availableQuantity} panels (delivered anyway)` })
      }
    })

    // ---- Bulk insert in FK order ----
    if (soData.length) await prisma.salesOrder.createMany({ data: soData as never })
    if (soLineData.length) await prisma.salesOrderLine.createMany({ data: soLineData as never })
    if (doData.length) await prisma.deliveryOrder.createMany({ data: doData as never })
    if (doLineData.length) await prisma.deliveryOrderLine.createMany({ data: doLineData as never })
    if (moveData.length) await prisma.stockMovement.createMany({ data: moveData as never })

    await writeAuditLog({
      userId: session.userId,
      action: "IMPORT",
      entity: "SalesOrder",
      entityId: "bulk",
      changes: { salesOrders: soData.length, delivered, errors: errors.length },
    })

    return Response.json({ inserted: soData.length, skipped: 0, errors })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to import sales & delivery orders" }, { status: 500 })
  }
}
