import { Pool } from "pg"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../src/generated/prisma/client"
import { StockMovementType } from "../src/generated/prisma/enums"

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

// Physical stock = Panels Available for Sale + Unlifted DOs
// (all panels physically present in warehouse as of 2026-05-13)
const OPENING_STOCK = [
  { name: "Longi Himo 7 - 620 BF",    code: "LONGI-620-BF",    wattage: 620, brand: "Longi",          packing: 36, panels: 5760,  costPerWatt: 35.70 },
  { name: "Longi Himo 10 - 645",       code: "LONGI-645",       wattage: 645, brand: "Longi",          packing: 36, panels: 2196,  costPerWatt: 36.40 },
  { name: "Longi Himo 10 - 645 Mono",  code: "LONGI-645-MONO",  wattage: 645, brand: "Longi",          packing: 36, panels: 2808,  costPerWatt: 37.50 },
  { name: "Longi Himo 10 - 650 MF",    code: "LONGI-650-MF",    wattage: 650, brand: "Longi",          packing: 36, panels: 2160,  costPerWatt: 36.39 },
  { name: "Jinko - 585 Bificial",      code: "JINKO-585-BF",    wattage: 585, brand: "Jinko",          packing: 36, panels: 4788,  costPerWatt: 26.68 },
  { name: "Canadian - 710 BF",         code: "CANADIAN-710-BF", wattage: 710, brand: "Canadian Solar",  packing: 33, panels: 26730, costPerWatt: 38.40 },
  { name: "Canadian - 715 BF",         code: "CANADIAN-715-BF", wattage: 715, brand: "Canadian Solar",  packing: 33, panels: 40887, costPerWatt: 38.40 },
  { name: "Aiko - 640 BF",             code: "AIKO-640-BF",     wattage: 640, brand: "Aiko",           packing: 36, panels: 720,   costPerWatt: 33.00 },
  { name: "Aiko - 645 BF",             code: "AIKO-645-BF",     wattage: 645, brand: "Aiko",           packing: 36, panels: 4824,  costPerWatt: 31.75 },
  { name: "Aiko - 650 BF",             code: "AIKO-650-BF",     wattage: 650, brand: "Aiko",           packing: 36, panels: 9540,  costPerWatt: 34.60 },
  { name: "Aiko - 665 BF",             code: "AIKO-665-BF",     wattage: 665, brand: "Aiko",           packing: 36, panels: 32940, costPerWatt: 35.30 },
  { name: "Aiko - 775 BF",             code: "AIKO-775-BF",     wattage: 775, brand: "Aiko",           packing: 33, panels: 2970,  costPerWatt: 33.20 },
  { name: "GS - 615 BF",               code: "GS-615-BF",       wattage: 615, brand: "GS",             packing: 37, panels: 25900, costPerWatt: 31.50 },
  { name: "GS - 715 BF",               code: "GS-715-BF",       wattage: 715, brand: "GS",             packing: 33, panels: 23661, costPerWatt: 31.30 },
]

async function purgeTransactionalData() {
  console.log("\n=== PURGING TRANSACTIONAL DATA ===\n")

  const r: Record<string, number> = {}

  r.payments        = (await prisma.payment.deleteMany({})).count
  r.partyLedger     = (await prisma.partyLedger.deleteMany({})).count
  r.stockMovements  = (await prisma.stockMovement.deleteMany({})).count
  r.invoices        = (await prisma.invoice.deleteMany({})).count
  // DeliveryOrderLine is cascade-deleted when DeliveryOrder is deleted
  r.deliveryOrders  = (await prisma.deliveryOrder.deleteMany({})).count
  r.salesOrderLines = (await prisma.salesOrderLine.deleteMany({})).count
  r.salesOrders     = (await prisma.salesOrder.deleteMany({})).count
  r.quotationLines  = (await prisma.quotationLine.deleteMany({})).count
  r.quotations      = (await prisma.quotation.deleteMany({})).count
  r.stockEntries    = (await prisma.stockEntry.deleteMany({})).count
  r.poDocuments     = (await prisma.pODocument.deleteMany({})).count
  r.purchaseOrders  = (await prisma.purchaseOrder.deleteMany({})).count
  r.costings        = (await prisma.costingCalculation.deleteMany({})).count
  r.customerReceipts = (await prisma.customerReceipt.deleteMany({})).count
  r.expenses        = (await prisma.expense.deleteMany({})).count
  r.auditLogs       = (await prisma.auditLog.deleteMany({})).count
  r.counters        = (await prisma.counter.deleteMany({})).count

  for (const [table, count] of Object.entries(r)) {
    if (count > 0) console.log(`  Deleted ${count.toString().padStart(6)} rows from ${table}`)
  }
  console.log("\n  Master data preserved: Customers, Suppliers, Banks, Warehouses, Users, Products, ExchangeRate, TaxConfig, ExpenseCategoryDef\n")
}

async function seedOpeningStock() {
  console.log("=== SEEDING OPENING STOCK (2026-05-13) ===\n")

  const warehouse = await prisma.warehouse.findFirst({ where: { active: true } })
  if (!warehouse) throw new Error("No active warehouse found — please add a warehouse first.")
  console.log(`  Using warehouse: ${warehouse.name} (${warehouse.location})\n`)

  const openingDate = new Date("2026-05-13T00:00:00Z")
  let created = 0
  let skipped = 0

  for (const item of OPENING_STOCK) {
    const costPerPanel  = Math.round(item.wattage * item.costPerWatt * 100) / 100
    const wattQuantity  = item.panels * item.wattage
    const totalValue    = Math.round(item.panels * costPerPanel * 100) / 100

    // Upsert product (create if not exists, leave existing unchanged)
    const product = await prisma.product.upsert({
      where: { code: item.code },
      update: {},
      create: {
        code:               item.code,
        name:               item.name,
        category:           "Solar Panel",
        wattage:            item.wattage,
        brand:              item.brand,
        panelsPerContainer: item.packing,
        lowStockThreshold:  item.packing, // one container as low-stock threshold
        active:             true,
      },
    })

    // Guard: skip if opening balance already seeded for this product/warehouse
    const existing = await prisma.stockEntry.findFirst({
      where: { productId: product.id, warehouseId: warehouse.id, poId: null },
    })
    if (existing) {
      console.log(`  SKIP  ${item.name.padEnd(30)} (opening entry already exists)`)
      skipped++
      continue
    }

    const entry = await prisma.stockEntry.create({
      data: {
        productId:     product.id,
        warehouseId:   warehouse.id,
        poId:          null,
        lcReference:   "OPENING-BALANCE",
        panelQuantity: item.panels,
        wattQuantity,
        costPerPanel,
        costPerWatt:   item.costPerWatt,
        totalValue,
        receivedAt:    openingDate,
      },
    })

    await prisma.stockMovement.create({
      data: {
        stockEntryId: entry.id,
        type:         StockMovementType.ADJUSTMENT,
        quantity:     item.panels,
        watts:        wattQuantity,
        reason:       "Opening balance 2026-05-13",
      },
    })

    console.log(
      `  SEED  ${item.name.padEnd(30)}  ${String(item.panels).padStart(7)} panels` +
      `  ${String(wattQuantity).padStart(12)} W  PKR ${totalValue.toLocaleString("en-PK")}`
    )
    created++
  }

  const totalPanels = OPENING_STOCK.reduce((s, i) => s + i.panels, 0)
  console.log(`\n  Created: ${created}  Skipped: ${skipped}`)
  console.log(`  Total physical panels seeded: ${totalPanels.toLocaleString("en-PK")}`)
  console.log(`\n  NOTE: 54,006 unlifted (reserved) panels ARE included in the above figures.`)
  console.log(`  If any of those orders need to be re-entered, create new SOs from the customers page.\n`)
}

async function main() {
  try {
    await purgeTransactionalData()
    await seedOpeningStock()
    console.log("=== DONE ===\n")
  } finally {
    await prisma.$disconnect()
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => { prisma.$disconnect(); pool.end() })
