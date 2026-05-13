/**
 * Opening balance import — 14 SKUs as of 13 May 2026.
 * Creates StockEntry records with STOCK_IN for total received
 * and STOCK_OUT for total sold, giving correct available quantities.
 * Safe to run multiple times: skips existing entries by checking tag.
 */

import { Pool } from "pg"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../src/generated/prisma/client"

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

const OPENING_REASON = "OPENING_BALANCE_IMPORT_2026"
const RECEIVED_AT = new Date("2024-01-01T00:00:00.000Z")

const MISSING_PRODUCTS = [
  {
    code: "LON-620BF",
    name: "Longi Himo 7 - 620 BF",
    brand: "Longi",
    skuName: "Himo 7 - 620 BF",
    wattage: 620,
    panelsPerContainer: 720,
    palletsPerContainer: 20,
  },
  {
    code: "AIK-775BF",
    name: "Aiko 775 BF",
    brand: "Aiko",
    skuName: "775 BF",
    wattage: 775,
    panelsPerContainer: 660,
    palletsPerContainer: 20,
  },
]

// code → { totalReceived, totalSold, costPerWatt }
const OPENING_DATA: Record<string, { totalReceived: number; totalSold: number; costPerWatt: number }> = {
  "LON-620BF":  { totalReceived:  5760, totalSold:    72, costPerWatt: 35.70 },
  "LON-645":    { totalReceived: 21960, totalSold: 21888, costPerWatt: 36.40 },
  "LON-645M":   { totalReceived: 12960, totalSold: 11520, costPerWatt: 37.50 },
  "LON-650MF":  { totalReceived:  3600, totalSold:  3528, costPerWatt: 36.39 },
  "JNK-585BF":  { totalReceived: 50400, totalSold: 49716, costPerWatt: 26.68 },
  "CAN-710BF":  { totalReceived: 30888, totalSold:  6303, costPerWatt: 38.40 },
  "CAN-715BF":  { totalReceived: 45144, totalSold: 14025, costPerWatt: 38.40 },
  "AIK-640BF":  { totalReceived:  3600, totalSold:  2880, costPerWatt: 33.00 },
  "AIK-645BF":  { totalReceived: 18360, totalSold: 15372, costPerWatt: 31.75 },
  "AIK-650BF":  { totalReceived: 14400, totalSold:  6660, costPerWatt: 34.60 },
  "AIK-665BF":  { totalReceived: 46800, totalSold: 29868, costPerWatt: 35.30 },
  "AIK-775BF":  { totalReceived:  2970, totalSold:  1716, costPerWatt: 33.20 },
  "GS-615BF":   { totalReceived: 25900, totalSold: 12839, costPerWatt: 31.50 },
  "GS-715BF":   { totalReceived: 23760, totalSold:  1419, costPerWatt: 31.30 },
}

async function main() {
  // ── 1. Find warehouse ────────────────────────────────────────────────────────
  const warehouse = await prisma.warehouse.findFirst({ orderBy: { createdAt: "asc" } })
  if (!warehouse) throw new Error("No warehouse found — run the main seed first")
  console.log(`Using warehouse: ${warehouse.name} (${warehouse.id})`)

  // ── 2. Find suppliers by brand ───────────────────────────────────────────────
  const suppliers = await prisma.supplier.findMany()
  const supplierByBrand: Record<string, string> = {}
  for (const s of suppliers) {
    if (s.name.toLowerCase().includes("longi")) supplierByBrand["Longi"] = s.id
    if (s.name.toLowerCase().includes("jinko")) supplierByBrand["Jinko"] = s.id
    if (s.name.toLowerCase().includes("canadian")) supplierByBrand["Canadian"] = s.id
    if (s.name.toLowerCase().includes("aiko")) supplierByBrand["Aiko"] = s.id
    if (s.name.toLowerCase().includes("gokin") || s.name.toLowerCase().includes("gs")) supplierByBrand["GS (Gokin)"] = s.id
  }

  // ── 3. Upsert missing products ───────────────────────────────────────────────
  for (const p of MISSING_PRODUCTS) {
    const existing = await prisma.product.findUnique({ where: { code: p.code } })
    if (existing) {
      console.log(`  Product ${p.code} already exists — skipping`)
    } else {
      await prisma.product.create({
        data: {
          code: p.code,
          name: p.name,
          brand: p.brand,
          skuName: p.skuName,
          wattage: p.wattage,
          category: "Solar Panel",
          panelsPerContainer: p.panelsPerContainer,
          palletsPerContainer: p.palletsPerContainer,
          defaultSupplierId: supplierByBrand[p.brand] || null,
        },
      })
      console.log(`  Created product: ${p.code}`)
    }
  }

  // ── 4. Import opening balances ───────────────────────────────────────────────
  for (const [code, data] of Object.entries(OPENING_DATA)) {
    const product = await prisma.product.findUnique({ where: { code } })
    if (!product) {
      console.warn(`  WARNING: Product ${code} not found — skipping`)
      continue
    }

    // Check if already imported (idempotent)
    const existingEntry = await prisma.stockEntry.findFirst({
      where: {
        productId: product.id,
        warehouseId: warehouse.id,
        lcReference: OPENING_REASON,
      },
    })
    if (existingEntry) {
      console.log(`  ${code}: already imported — skipping`)
      continue
    }

    const { totalReceived, totalSold, costPerWatt } = data
    const wattage = product.wattage
    const totalWatts = totalReceived * wattage
    const costPerPanel = costPerWatt * wattage
    const totalValue = costPerWatt * totalWatts

    const entry = await prisma.stockEntry.create({
      data: {
        productId: product.id,
        warehouseId: warehouse.id,
        lcReference: OPENING_REASON,
        panelQuantity: totalReceived,
        wattQuantity: totalWatts,
        costPerPanel,
        costPerWatt,
        totalValue,
        receivedAt: RECEIVED_AT,
      },
    })

    // STOCK_IN for all received panels
    await prisma.stockMovement.create({
      data: {
        stockEntryId: entry.id,
        type: "STOCK_IN",
        quantity: totalReceived,
        watts: totalWatts,
        reason: "Opening balance — total received",
      },
    })

    // STOCK_OUT for all historically sold panels
    if (totalSold > 0) {
      await prisma.stockMovement.create({
        data: {
          stockEntryId: entry.id,
          type: "STOCK_OUT",
          quantity: totalSold,
          watts: totalSold * wattage,
          reason: "Opening balance — historical sales adjustment",
        },
      })
    }

    const available = totalReceived - totalSold
    console.log(
      `  ${code.padEnd(12)} received=${totalReceived.toLocaleString().padStart(7)} sold=${totalSold.toLocaleString().padStart(7)} available=${available.toLocaleString().padStart(7)} @ Rs ${costPerWatt}/W`
    )
  }

  console.log("\nOpening balance import complete.")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => { prisma.$disconnect(); pool.end() })
