import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"
import { cleanStr, norm, parseDate, parseNum, pick, resolveBankId, resolveProductId, type Row } from "@/lib/import"

/**
 * Bulk-import purchase orders. Captures every column, creates missing suppliers,
 * and inserts the POs in a single createMany (PO numbers allocated in one shot).
 * Does NOT create stock — receiving stock is a separate step.
 */
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session.isLoggedIn) return Response.json({ error: "Unauthorized" }, { status: 401 })

    const { rows } = (await request.json()) as { rows: Row[] }
    if (!Array.isArray(rows)) return Response.json({ error: "Invalid payload" }, { status: 400 })

    const [products, suppliers, banks, warehouses] = await Promise.all([
      prisma.product.findMany({ select: { id: true, name: true, brand: true, wattage: true } }),
      prisma.supplier.findMany({ select: { id: true, name: true } }),
      prisma.bank.findMany({ select: { id: true, name: true } }),
      prisma.warehouse.findMany({ select: { id: true, name: true } }),
    ])
    const supByNorm = new Map(suppliers.map((s) => [norm(s.name), s.id]))
    const onlyWarehouse = warehouses.length === 1 ? warehouses[0] : null

    // Create any missing suppliers up front (distinct names only).
    const distinctSuppliers = new Set(rows.map((r) => cleanStr(pick(r, "Supplier", "Party"))).filter(Boolean))
    for (const name of distinctSuppliers) {
      if (!supByNorm.has(norm(name))) {
        const s = await prisma.supplier.create({ data: { name } })
        supByNorm.set(norm(name), s.id)
      }
    }

    const errors: { row: number; message: string }[] = []
    const poData: object[] = []

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const line = i + 2
      const productId = resolveProductId(cleanStr(pick(row, "Product", "Item")), products)
      if (!productId) { errors.push({ row: line, message: `Product "${cleanStr(pick(row, "Product", "Item"))}" not found` }); continue }
      const product = products.find((p) => p.id === productId)!
      const supplierName = cleanStr(pick(row, "Supplier", "Party"))
      const supplierId = supByNorm.get(norm(supplierName))
      if (!supplierId) { errors.push({ row: line, message: "Missing supplier" }); continue }

      const panels = parseNum(pick(row, "Qty Panels", "Panels", "No of Panels"))
      if (panels == null || panels <= 0) { errors.push({ row: line, message: "Qty Panels must be a positive number" }); continue }
      const wattage = Math.round(parseNum(pick(row, "Panel Wattage", "Qty/Panel", "Watt/P")) ?? product.wattage)
      const totalWatts = Math.round(parseNum(pick(row, "Qty Watts", "Total Watts")) ?? panels * wattage)
      const ratePerWatt = parseNum(pick(row, "Rate per Watt (PKR)", "Rate/ W", "Rate/W", "Rate per Watt"))
      const pkrValue = parseNum(pick(row, "PKR Value", "PKR Amount", "Value")) ?? (ratePerWatt != null ? ratePerWatt * totalWatts : null)
      if (pkrValue == null || pkrValue <= 0) { errors.push({ row: line, message: "Provide PKR Value or Rate per Watt" }); continue }

      const lcRef = cleanStr(pick(row, "LC Ref", "LC Number", "LC No"))
      const isLocal = /local/i.test(lcRef)
      const containers = parseNum(pick(row, "Qty Containers", "Qty Container", "Containers", "No of Containers"))
      const date = parseDate(pick(row, "Date")) ?? new Date()
      let bankId: string | null = null
      if (!isLocal && lcRef) {
        const lastToken = lcRef.split(/\s+/).pop() || ""
        if (lastToken && !/^lc/i.test(lastToken)) bankId = resolveBankId(lastToken, banks)
      }

      poData.push({
        productId, supplierId, lcType: isLocal ? "LOCAL" : "SIGHT", lcNumber: isLocal ? null : lcRef || null, bankId,
        warehouseId: onlyWarehouse?.id ?? null, noOfPanels: Math.round(panels), panelWattage: wattage, totalWatts,
        noOfContainers: containers != null ? Math.round(containers) : null,
        usdPerWatt: 0, totalValueUsd: 0, poAmountPkr: pkrValue, status: "RECEIVED", createdAt: date,
      })
    }

    // Allocate PO numbers in one shot, then bulk insert.
    if (poData.length > 0) {
      const year = new Date().getFullYear()
      const counter = await prisma.counter.upsert({
        where: { id: `PO-${year}` },
        update: { value: { increment: poData.length } },
        create: { id: `PO-${year}`, value: poData.length },
      })
      const start = counter.value - poData.length + 1
      poData.forEach((d, idx) => { (d as { poNumber?: string }).poNumber = `PO-${year}-${String(start + idx).padStart(3, "0")}` })
      await prisma.purchaseOrder.createMany({ data: poData as never })
    }

    await writeAuditLog({
      userId: session.userId,
      action: "IMPORT",
      entity: "PurchaseOrder",
      entityId: "bulk",
      changes: { inserted: poData.length, errors: errors.length },
    })

    return Response.json({ inserted: poData.length, skipped: 0, errors })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to import purchase orders" }, { status: 500 })
  }
}
