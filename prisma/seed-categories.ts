import { Pool } from "pg"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../src/generated/prisma/client"

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  const year = new Date().getFullYear()
  await prisma.counter.upsert({
    where: { id: `RCP-${year}` },
    update: {},
    create: { id: `RCP-${year}`, value: 0 },
  })

  const cats = ["Salary", "Commission", "Warehouse Rent", "Utilities", "Transport", "Marketing", "Office / Admin", "Other"]
  for (const name of cats) {
    await prisma.expenseCategoryDef.upsert({
      where: { name },
      update: {},
      create: { name, isSystem: true, active: true },
    })
  }
  console.log("✅ Seeded receipt counter and expense categories")
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
