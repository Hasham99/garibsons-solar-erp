import { Pool } from "pg"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../src/generated/prisma/client"
import bcrypt from "bcryptjs"

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log("🌱 Seeding database...")

  // ── Admin user ──
  const adminPwd = await bcrypt.hash("admin123", 12)
  await prisma.user.upsert({
    where: { email: "admin@garibsons.com" },
    update: {},
    create: { name: "Admin", email: "admin@garibsons.com", password: adminPwd, role: "ADMIN" },
  })
  console.log("✅ Admin user")

  // ── Counters ──
  const year = new Date().getFullYear()
  for (const type of ["PO", "SO", "QT", "DO", "SOL-DO", "COST", "INV"]) {
    await prisma.counter.upsert({
      where: { id: `${type}-${year}` },
      update: {},
      create: { id: `${type}-${year}`, value: 0 },
    })
  }
  console.log("✅ Counters")

  // ── Banks ──
  const banks = [
    "United Bank Limited",
    "Standard Chartered Bank",
    "Meezan Bank",
    "Bank Alfalah",
    "Dubai Islamic Bank",
    "Faysal Bank",
    "Habib Bank Limited",
    "MCB Bank",
    "National Bank of Pakistan",
    "Habib Metropolitan Bank",
    "Al Baraka Bank",
    "Bank Islami",
  ]
  for (const name of banks) {
    await prisma.bank.upsert({ where: { id: name }, update: {}, create: { id: name, name } }).catch(async () => {
      const existing = await prisma.bank.findFirst({ where: { name } })
      if (!existing) await prisma.bank.create({ data: { name } })
    })
  }
  // Use findFirst approach since Bank has no unique name constraint
  await prisma.bank.deleteMany()
  for (const name of banks) {
    await prisma.bank.create({ data: { name } })
  }
  console.log("✅ Banks")

  // ── Warehouses ──
  await prisma.warehouse.deleteMany()
  await prisma.warehouse.create({
    data: { name: "Noman Warehouse", location: "Hawksbay, Karachi", manager: "Atif" },
  })
  console.log("✅ Warehouses")

  // ── Suppliers ──
  await prisma.supplier.deleteMany()
  const supplierData = [
    { name: "Longi Solar Technology Co. Ltd",              country: "China",       paymentTerms: "60-day", defaultLeadTime: 45 },
    { name: "Zhejiang Jinko Solar Co., Ltd",               country: "China",       paymentTerms: "60-day", defaultLeadTime: 45 },
    { name: "Canadian Solar International Limited",         country: "Canada/China",paymentTerms: "60-day", defaultLeadTime: 45 },
    { name: "Zhuhai Fushan Aiko Solar Technology Co., Ltd", country: "China",       paymentTerms: "60-day", defaultLeadTime: 45 },
    { name: "Gokin Solar (Hongkong) Company Limited",       country: "Hong Kong",   paymentTerms: "60-day", defaultLeadTime: 45 },
  ]
  const suppliersByBrand: Record<string, string> = {}
  const brandToSupplierName: Record<string, string> = {
    "Longi":     "Longi Solar Technology Co. Ltd",
    "Jinko":     "Zhejiang Jinko Solar Co., Ltd",
    "Canadian":  "Canadian Solar International Limited",
    "Aiko":      "Zhuhai Fushan Aiko Solar Technology Co., Ltd",
    "GS (Gokin)":"Gokin Solar (Hongkong) Company Limited",
  }
  for (const s of supplierData) {
    const created = await prisma.supplier.create({ data: s })
    const brand = Object.keys(brandToSupplierName).find((b) => brandToSupplierName[b] === s.name)
    if (brand) suppliersByBrand[brand] = created.id
  }
  console.log("✅ Suppliers")

  // ── Products ──
  await prisma.product.deleteMany()
  const productRows = [
    { code: "LON-645",  brand: "Longi",      skuName: "Himo 10 - 645",      wattage: 645, panelsPerContainer: 720, palletsPerContainer: 20 },
    { code: "LON-645M", brand: "Longi",      skuName: "Himo 10 - 645 Mono", wattage: 645, panelsPerContainer: 720, palletsPerContainer: 20 },
    { code: "LON-650MF",brand: "Longi",      skuName: "Himo 10 - 650 MF",   wattage: 650, panelsPerContainer: 720, palletsPerContainer: 20 },
    { code: "LON-610",  brand: "Longi",      skuName: "Himo 7 - 610",       wattage: 610, panelsPerContainer: 720, palletsPerContainer: 20 },
    { code: "LON-615",  brand: "Longi",      skuName: "Himo 7 - 615",       wattage: 615, panelsPerContainer: 720, palletsPerContainer: 20 },
    { code: "JNK-585BF",brand: "Jinko",      skuName: "585 Bifacial",        wattage: 585, panelsPerContainer: 720, palletsPerContainer: 20 },
    { code: "JNK-590BF",brand: "Jinko",      skuName: "590 Bifacial",        wattage: 590, panelsPerContainer: 720, palletsPerContainer: 20 },
    { code: "JNK-615BF",brand: "Jinko",      skuName: "615 Bifacial",        wattage: 615, panelsPerContainer: 720, palletsPerContainer: 20 },
    { code: "JNK-720BF",brand: "Jinko",      skuName: "720 Bifacial",        wattage: 720, panelsPerContainer: 660, palletsPerContainer: 20 },
    { code: "JNK-725BF",brand: "Jinko",      skuName: "725 Bifacial",        wattage: 725, panelsPerContainer: 660, palletsPerContainer: 20 },
    { code: "CAN-585BF",brand: "Canadian",   skuName: "585 BF",              wattage: 585, panelsPerContainer: 700, palletsPerContainer: 20 },
    { code: "CAN-590BF",brand: "Canadian",   skuName: "590 BF",              wattage: 590, panelsPerContainer: 700, palletsPerContainer: 20 },
    { code: "CAN-610BF",brand: "Canadian",   skuName: "610 BF",              wattage: 610, panelsPerContainer: 720, palletsPerContainer: 20 },
    { code: "CAN-615BF",brand: "Canadian",   skuName: "615 BF",              wattage: 615, panelsPerContainer: 720, palletsPerContainer: 20 },
    { code: "CAN-710BF",brand: "Canadian",   skuName: "710 BF",              wattage: 710, panelsPerContainer: 594, palletsPerContainer: 18 },
    { code: "CAN-715BF",brand: "Canadian",   skuName: "715 BF",              wattage: 715, panelsPerContainer: 594, palletsPerContainer: 18 },
    { code: "AIK-640BF",brand: "Aiko",       skuName: "640 BF",              wattage: 640, panelsPerContainer: 720, palletsPerContainer: 20 },
    { code: "AIK-645BF",brand: "Aiko",       skuName: "645 BF",              wattage: 645, panelsPerContainer: 720, palletsPerContainer: 20 },
    { code: "AIK-650BF",brand: "Aiko",       skuName: "650 BF",              wattage: 650, panelsPerContainer: 720, palletsPerContainer: 20 },
    { code: "AIK-665BF",brand: "Aiko",       skuName: "665 BF",              wattage: 665, panelsPerContainer: 720, palletsPerContainer: 20 },
    { code: "AIK-710BF",brand: "Aiko",       skuName: "710 BF",              wattage: 710, panelsPerContainer: 720, palletsPerContainer: 20 },
    { code: "AIK-715BF",brand: "Aiko",       skuName: "715 BF",              wattage: 715, panelsPerContainer: 720, palletsPerContainer: 20 },
    { code: "GS-615BF", brand: "GS (Gokin)", skuName: "615 BF",              wattage: 615, panelsPerContainer: 740, palletsPerContainer: 20 },
    { code: "GS-715BF", brand: "GS (Gokin)", skuName: "715 BF",              wattage: 715, panelsPerContainer: 660, palletsPerContainer: 20 },
  ]
  for (const p of productRows) {
    await prisma.product.create({
      data: {
        code: p.code,
        name: `${p.brand} ${p.skuName}`,
        skuName: p.skuName,
        brand: p.brand,
        wattage: p.wattage,
        panelsPerContainer: p.panelsPerContainer,
        palletsPerContainer: p.palletsPerContainer,
        category: "Solar Panel",
        defaultSupplierId: suppliersByBrand[p.brand] || null,
      },
    })
  }
  console.log("✅ Products (24)")

  // ── Customers ──
  await prisma.customer.deleteMany()
  const customerNames = [
    "Adaptive", "Abrar Battery", "Afzal Solar", "AG Traders", "Ahsaan Solar",
    "Al Qasar", "Ali Raza Shaikh", "Ali Solar", "Alkaram Packaging", "Allah Wasaya Sun",
    "Alpha Green", "AM Energy", "Amica Energy", "Amir Almas", "Anjar",
    "Arsalan Saq", "Ashraf Electronics", "Asif & Co", "Asif EPC", "Asif Goawala",
    "AU Solar", "Auto Tyres", "Avinash Solar", "Aziz Solar", "Beyond Green",
    "Bilal Joya", "Bilal Riaz", "Bilzup Energy", "Bismillah Solar", "Boom Power",
    "Burma Oil", "Buzdar Solar", "Dammam Solar", "DM Solar", "Dynasty Grain",
    "E Solutions", "Eng Irfan", "Evolution Solar", "Faizan Solar", "Fasiullah",
    "Fawad Communication", "Fayyaz Solar", "FD Solar", "Forfeit Account", "Four Star Solar",
    "Friend Solar", "Furqan Hyderabad", "GNS Solar", "Go Green", "Go Power",
    "GS Energy System (Shakir)", "GS Gharo", "GS Islamabad", "Hanif Solar", "Idrees Electronics",
    "Imran Gaba", "Imran Solar", "Inam Solar", "Insaaf Solar", "Interface Engg. & Cons.",
    "Irfan Solar", "Ismail Malik", "Jan Solar", "Jawed Akhtar", "Jodat Ali",
    "JP Solar", "JS Solar", "Kap Impex", "Karachi Solar", "Khalifa Electric",
    "KO Flux", "Latif Solar", "Latif Tariq", "Lords Solar", "M Arif Solar",
    "Madni Traders", "Madni Traders New", "Marwell", "Mashooq Ali", "Master Electronics",
    "Mateen Solar", "Max Green", "Mehboob Electric", "Mehran Engineering", "Metatex",
    "MRB Solar", "Naeem Solar", "Naveed Solar", "Neeraj", "New Naqi Electronic",
    "Next Energy", "Nn Enterprises", "Noman Solar", "Noor Fatima", "Onyx Solar",
    "Orme Energy", "Owais Solar", "Parekh Solar", "Parekh VFD", "Parkash Solar",
    "Parshotam", "Power Best", "Power Next", "Quantum Engineering", "Ramzan Solar",
    "Rashid Bilal", "Regal Shop (GS Energy Solar)", "Rezone", "SA Rehman", "Sachal Eng.",
    "Saif Maan", "Saleem Memon", "Salim Bhai", "Salona", "Shabbir Joya",
    "Shahbaz Solar", "Shahid Bawani", "Shahid Ent", "Shahid Paracha", "Shaqeeb",
    "Shizal Enterprises", "Sindh Solar", "SJ Solar Mardan", "SMZ Solar", "Sohail Jaffrani",
    "Sohail Tubewell", "Solar City", "Stengrid", "Sunair Solar", "Sungam Solar",
    "Sungrow - Hamza", "Sungrow Power HongKong", "Synergy Corporation", "Tariq Shab", "Taunsa Solar",
    "Tenergy", "Tesla Solar", "Trust Power", "United Electric", "Universal",
    "Usama Solar", "Usman Hafiz Solar", "Vinesh", "Vinod Solar", "Volton Solar",
    "VPS Solar", "Yasir Solar", "Zahid Electric", "Zaisha Ent", "Zee Solar",
    "Zeeshan Regal", "ZK Solar",
  ]
  for (const name of customerNames) {
    await prisma.customer.create({
      data: { name, type: "DIRECT", paymentTerms: "FULL_PAYMENT" },
    })
  }
  console.log(`✅ Customers (${customerNames.length})`)

  console.log("\n🎉 Seeding complete!")
  console.log("  Admin: admin@garibsons.com / admin123")
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
