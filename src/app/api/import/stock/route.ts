import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"
import { cleanStr, norm, parseDate, parseNum, pick, resolveProductId, type Row } from "@/lib/import"
import { randomUUID } from "crypto"

/**
 * Bulk-import opening stock. Captures the admin's exact Qty Watts / Total Value
 * (falls back to computing them), skips the title / "Total" rows, and inserts
 * all stock entries + their STOCK_IN movements via two createMany calls.
 */
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session.isLoggedIn) return Response.json({ error: "Unauthorized" }, { status: 401 })

    const { rows } = (await request.json()) as { rows: Row[] }
    if (!Array.isArray(rows)) return Response.json({ error: "Invalid payload" }, { status: 400 })

    const [products, warehouses] = await Promise.all([
      prisma.product.findMany({ select: { id: true, name: true, brand: true, wattage: true } }),
      prisma.warehouse.findMany({ select: { id: true, name: true } }),
    ])
    const onlyWarehouse = warehouses.length === 1 ? warehouses[0] : null

    const errors: { row: number; message: string }[] = []
    const entryData: object[] = []
    const moveData: object[] = []
    let skipped = 0

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const line = i + 2
      const itemLabel = cleanStr(pick(row, "Item", "Item Solar", "Product"))
      if (!itemLabel || norm(itemLabel) === "total") { skipped++; continue }

      const productId = resolveProductId(itemLabel, products)
      if (!productId) { errors.push({ row: line, message: `Product "${itemLabel}" not found` }); continue }
      const product = products.find((p) => p.id === productId)!

      const whVal = cleanStr(pick(row, "Warehouse"))
      const warehouseId = whVal ? warehouses.find((w) => norm(w.name) === norm(whVal))?.id : onlyWarehouse?.id
      if (!warehouseId) { errors.push({ row: line, message: whVal ? `Warehouse "${whVal}" not found` : "No warehouse specified" }); continue }

      const panels = parseNum(pick(row, "Panels", "Qty Panels", "Panel Quantity", "Qty"))
      if (panels == null || panels <= 0) { errors.push({ row: line, message: "Panels must be a positive number" }); continue }

      const wattage = Math.round(parseNum(pick(row, "Panel Wattage", "Watt", "Watt/P")) ?? product.wattage)
      const qtyWatts = Math.round(parseNum(pick(row, "Qty Watts", "Total Watts")) ?? panels * wattage)
      const rateW = parseNum(pick(row, "Rate per Watt (PKR)", "Rate/Watt", "Rate/ Watt", "Cost Per Watt", "Cost/Watt"))
      const totalVal = parseNum(pick(row, "Total Value", "Value"))
      let cpw = rateW ?? (totalVal != null && qtyWatts > 0 ? totalVal / qtyWatts : null)
      let cpp = parseNum(pick(row, "Cost Per Panel", "Cost/Panel")) ?? (totalVal != null ? totalVal / panels : (cpw != null ? cpw * wattage : null))
      if (cpw == null && cpp == null) { errors.push({ row: line, message: "Provide Rate per Watt or Total Value" }); continue }
      cpw = cpw ?? cpp! / wattage
      cpp = cpp ?? cpw * wattage

      const id = randomUUID()
      entryData.push({
        id, productId, warehouseId, lcReference: "OPENING (bulk import)",
        panelQuantity: Math.round(panels), wattQuantity: qtyWatts, costPerPanel: cpp, costPerWatt: cpw,
        totalValue: totalVal ?? cpp * panels,
        receivedAt: parseDate(pick(row, "Received Date", "Date", "As Of")) ?? new Date(),
      })
      moveData.push({ stockEntryId: id, type: "STOCK_IN", quantity: Math.round(panels), watts: qtyWatts, reason: "Opening stock (bulk import)", userId: session.userId || null })
    }

    if (entryData.length) await prisma.stockEntry.createMany({ data: entryData as never })
    if (moveData.length) await prisma.stockMovement.createMany({ data: moveData as never })

    await writeAuditLog({
      userId: session.userId,
      action: "IMPORT",
      entity: "StockEntry",
      entityId: "bulk",
      changes: { inserted: entryData.length, skipped, errors: errors.length },
    })

    return Response.json({ inserted: entryData.length, skipped, errors })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to import stock" }, { status: 500 })
  }
}
